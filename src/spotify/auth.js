const admin = require('firebase-admin')
const db = admin.firestore()
const axios = require('axios')
const qs = require('qs')
const express = require('express')
const router = express.Router()
const { redis } = require('../config')


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

async function login (code) {
  // Post Spotify server for code verification & authorization code
  const spotifyAuthData = (await spotifyAuthServer.post('/token', qs.stringify({
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: process.env.HOST + process.env.BASE_URL + '/spotify/auth/login',
  }))).data
  spotifyServer.defaults.headers['Authorization'] = spotifyAuthData.token_type + ' ' + spotifyAuthData.access_token
  const userInfo = (await spotifyServer.get('/me')).data
  const user = await admin.auth().getUserByEmail(userInfo.email) // Query user by email in firebase
    .catch(error => {
      if (error.code === 'auth/user-not-found') {
        // No User
        return admin.auth().createUser({
          displayName: response.data.display_name,
          email: response.data.email,
          emailVerified: true,
        })
      }
      throw error
    })
  const userProfileRef = db.collection('users').doc(user.uid)
  userProfileRef.get()
    .then(userProfile => {
      if (userProfile.exists) {
        return userProfileRef.update({
          'keys.spotify.access_token': spotifyAuthData.access_token,
          'keys.spotify.refresh_token': spotifyAuthData.refresh_token,
          'keys.spotify.expires': spotifyAuthData.expires_in + Date.now() / 1000 | 0,
          'keys.spotify.token_type': spotifyAuthData.token_type,
          'keys.spotify.scope': spotifyAuthData.scope,
        })
      } else {
        return userProfileRef.set({
          keys: {
            spotify: {
              access_token: spotifyAuthData.access_token,
              refresh_token: spotifyAuthData.refresh_token,
              token_type: spotifyAuthData.token_type,
              expires: spotifyAuthData.expires_in + Date.now() / 1000 | 0,
              scope: spotifyAuthData.scope,
            }
          }
        })
      }
    })
  token = await admin.auth().createCustomToken(user.uid)
  console.log('returned')
  return [spotifyAuthData, token]
}
router.get('/login', (req, res, next) => {
  if (!req.query.code) {
    throw { message: "Missing authentication code", status: 400 }
  }
  login(req.query.code)
    .then(([spotifyAuthData, token]) => {
      console.log('rendered')
      res.render('spotify-login', {
        spotify: {
          access_token: spotifyAuthData.access_token,
          expires_in: spotifyAuthData.expires_in,
        },
        token: token,
        host: process.env.WEB_HOST,
      })
    }).catch(error => {
      console.log(error)
      next({
        message: (error.response && error.response.data.error_description)
          ? error.response.data.error_description
          : 'Failed to connect to server',
        status: error.response ? error.response.status : 502,
        detail: error.response ? error.response.data : undefined
      })
    })
})

const ClientCredentialRedisKey = 'SpotifyClientCredentials'
router.get('/client-credential', async (req, res, next) => {
  let clientCredentials = await redis.get(ClientCredentialRedisKey)
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
    let expireTime = data.expires_in - 60
    if (expireTime > 0) {
      await redis.set(ClientCredentialRedisKey, clientCredentials, 'EX',  expireTime)
    }
  }
  res.send(clientCredentials)
})

module.exports = router
