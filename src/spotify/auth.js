const admin = require('firebase-admin')
const axios = require('axios')
const qs = require('qs')
const express = require('express')
const router = express.Router()
const { redis, mongodb, config } = require('../config')

const spotifyAuthServer = axios.create({
  baseURL: 'https://accounts.spotify.com/api',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Authorization': 'Basic ' + Buffer.from(
      config.spotify.id + ':' + config.spotify.secret).toString('base64')
  }
})

// Spotify Login
const SpotifyStrategy = require('passport-spotify').Strategy
const passport = require('passport')
const RedisAccessTokenCachePrefix = 'SpotifyAccessToken:'
function postLogin (accessToken, refreshToken, expiresIn, profile, done) {
  const email = profile._json.email
  function createUser () {
    return admin.auth().createUser({
      displayName: profile.display_name,
      email: email,
      emailVerified: false,
    })
  }
  (email
    ? admin.auth().getUserByEmail(email)
      .catch(error => {
        if (error.code === 'auth/user-not-found') {
          return createUser()
        }
        throw error
      })
    : createUser()
  ).then(async user => {
    const expireTime = justifyExpirationTime(expiresIn)
    // Concurrently
    const db = mongodb.db('users').collection('spotify')
    const [token] = await Promise.all([
      admin.auth().createCustomToken(user.uid), // Create Token for Spotify-based login
      expireTime
        ? redis.set(RedisAccessTokenCachePrefix + user.uid, accessToken, 'EX', expireTime)
        : Promise.resolve(), // Cache Access Token
      db.updateOne({ uid: user.uid }, { $set: { refresh_token: refreshToken } }, {
        upsert: true
      }),
    ])
    done(null, user, {
      token: token,
      spotify: {
        access_token: accessToken,
        expires_in: expireTime,
        profile: profile._json,
      }
    })
  }).catch(err => {
    console.log(err)
    done(err)
  })
}
passport.use(
  new SpotifyStrategy(
    {
      clientID: config.spotify.id,
      clientSecret: config.spotify.secret,
      callbackURL: config.host + config.baseURL + '/spotify/auth/login',
      scope: [
        'user-read-private',
        'user-read-email',
        'user-modify-playback-state',
        'user-read-currently-playing',
        'user-read-playback-state'
      ]
    },
    postLogin
  )
)

router.get('/login', passport.authenticate('spotify', { failureRedirect: '/login' }),
  (req, res) => {
    res.render('spotify-login', {
      ...req.authInfo,
      host: config.webHost,
    })
  }
)

const ClientCredentialRedisKey = 'SpotifyClientCredentials'
router.get('/client-credential', async (req, res, next) => {
  let clientCredentials = await redis.get(ClientCredentialRedisKey)
  let ttl = clientCredentials ? (await redis.ttl(ClientCredentialRedisKey)) : null
  if (!clientCredentials) {
    console.debug('Acquiring new client credentials')
    const response = await spotifyAuthServer.post('/token', qs.stringify({
      grant_type: 'client_credentials'
    })).catch(error => {
      next({
        message: 'Failed to connect to Spotify server',
        status: error.response ? error.response.status : 502,
        detail: error.response ? error.response.data : undefined
      })
    })
    const data = response.data
    clientCredentials = data.access_token
    ttl = justifyExpirationTime(data.expires_in)
    if (ttl) {
      await redis.set(ClientCredentialRedisKey, clientCredentials, 'EX', ttl)
    }
  }
  res.send({
    access_token: clientCredentials,
    expires_in: ttl
  })
})

router.get('/refresh', passport.authenticate('bearer', { session: false }), async (req, res, next) => {
  if (!(req.isAuthenticated() && req.user && req.user.uid)) {
    res.status(401).send('Unauthorized')
    return
  }

  const key = RedisAccessTokenCachePrefix + req.user.uid
  let accessToken = await redis.get(key)
  let ttl = accessToken ? await redis.ttl(key) : null
  if (!accessToken) {
    const doc = await mongodb.db('users').collection('spotify').findOne({ uid: req.user.uid })
    if (!doc) {
      res.status(404).send('Unauthorized: Spotify Login Needed')
      return
    }
    const response = await spotifyAuthServer.post('/token', qs.stringify({
      grant_type: 'refresh_token',
      refresh_token: doc.refresh_token
    }))
    const data = response.data
    ttl = justifyExpirationTime(data.expires_in)
    accessToken = data.access_token
    if (ttl) {
      await redis.set(key, accessToken, 'EX', ttl)
    }
  }
  res.send({
    access_token: accessToken,
    expires_in: ttl
  })
})

module.exports = router

function justifyExpirationTime (expiresIn, offset = 60) {
  let expireTime = expiresIn - offset
  return expireTime > 0 ? expireTime : null
}
