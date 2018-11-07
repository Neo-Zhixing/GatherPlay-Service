const admin = require('firebase-admin')
const axios = require('axios')
const qs = require('qs')
const express = require('express')
const router = express.Router()
const { redis, mongodb } = require('../config')


const spotifyAuthServer = axios.create({
  baseURL: 'https://accounts.spotify.com/api',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Authorization': "Basic " + Buffer.from(
      process.env.SPOTIFY_CLIENT + ':' + process.env.SPOTIFY_SECRET).toString('base64'),
  }
})

const spotifyServer = axios.create({
  baseURL: 'https://api.spotify.com/v1',
})


// Spotify Login
const SpotifyStrategy = require('passport-spotify').Strategy
const passport = require('passport')
const RedisAccessTokenCachePrefix = "SpotifyAccessToken:"
function postLogin (accessToken, refreshToken, expires_in, profile, done) {
  const email = profile.emails && profile.emails.length > 0 && profile.emails[0].value
  const userPromise = email ?
    admin.auth().getUserByEmail(email) : // Query user by email in firebase
    Promise.reject({ code: 'auth/user-not-found'}) // Reject if user doesn't have email
  userPromise
    .catch(error => {
      if (error.code === 'auth/user-not-found') {
        // No linked user
        return admin.auth().createUser({
          displayName: profile.display_name,
          email: profile.email,
          emailVerified: false,
        })
      }
      throw error
    }).then(async user => {
      const expireTime = justifyExpirationTime(expires_in)
      // Concurrently
      const db = mongodb.db('users').collection('spotify')
      const [token] = await Promise.all([
        admin.auth().createCustomToken(user.uid), // Create Token for Spotify-based login
        expireTime ?
          redis.set(RedisAccessTokenCachePrefix + user.uid, accessToken, 'EX',  expires_in) :
          Promise.resolve(), // Cache Access Token
        db.updateOne({ uid: user.uid }, {$set: {refresh_token: refreshToken}}, {
          upsert: true
        }),
      ])
      done(null, user, {
        token: token,
        spotify: {
          access_token: accessToken,
          expires_in: expires_in,
          profile: profile,
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
      clientID: process.env.SPOTIFY_CLIENT,
      clientSecret: process.env.SPOTIFY_SECRET,
      callbackURL: process.env.HOST + process.env.BASE_URL + '/spotify/auth/login',
      scope: [
        "user-read-private",
        "user-read-email",
        "user-modify-playback-state",
        "user-read-currently-playing",
        "user-read-playback-state"
      ],
    },
    postLogin
  )
)

router.get('/login', passport.authenticate('spotify', { failureRedirect: '/login' }),
  (req, res) => {
    res.render('spotify-login', {
      ...req.authInfo,
      host: process.env.WEB_HOST,
    })
  }
)

const ClientCredentialRedisKey = 'SpotifyClientCredentials'
router.get('/client-credential', async (req, res, next) => {
  let clientCredentials = await redis.get(ClientCredentialRedisKey)
  let ttl = await redis.ttl(ClientCredentialRedisKey)
  if (!clientCredentials) {
    console.debug("Acquiring new client credentials")
    const response = await spotifyAuthServer.post('/token', qs.stringify({
      grant_type: 'client_credentials',
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
      await redis.set(ClientCredentialRedisKey, clientCredentials, 'EX',  ttl)
    }
  }
  res.send({
    access_token: clientCredentials,
    expires_in: ttl,
  })
})

router.get('/refresh', async (req, res) => {
  console.log(req.user)
  const db = mongodb.db('users').collection('spotify')
  db.findOne({ uid: 'SU7OJ6OVBphXDLtssqGWEBhwxXX2' })
    .then(doc => {
      console.log(doc)
    })
})

module.exports = router

function justifyExpirationTime(expires_in, offset=60) {
  let expireTime = expires_in - offset
  return expireTime > 0 ? expireTime : false
}
