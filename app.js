const createError = require('http-errors')
const express = require('express')
const passport = require('passport')
const BearerStrategy = require('passport-http-bearer').Strategy
const admin = require('firebase-admin')
const { mongodb, config } = require('./src/config')

admin.initializeApp({
  ...config.firebase,
  credential: admin.credential.applicationDefault()
})
admin.firestore().settings({
  timestampsInSnapshots: true
})

const app = express()
// Development environment configurations
if (app.get('env') === 'development') {
  console.log('Currently in dev mode')
  const morgan = require('morgan')
  app.use(morgan('combined'))
} else if (app.get('env') === 'production') {
  require('@google-cloud/debug-agent').start()
}
app.use('/', express.static('public'))

/*
const RedisStore = require('connect-redis')(session)
app.use(session({
  store: new RedisStore({
    client: redis.client,
  }),
  secret: 'keyboard cat',
  resave: false,
  saveUninitialized: false,
}))
*/

app.use(passport.initialize())

// app.use(passport.session())

passport.serializeUser((user, done) => {
  done(null, user.uid)
})
passport.deserializeUser((obj, done) => {
  if (!(obj instanceof String || typeof obj === 'string')) {
    done({ message: 'Only accepts user uid as string.', details: obj })
    return
  }
  admin.auth().getUser(obj)
    .then(user => {
      done(null, user)
    })
    .catch(error => {
      done(error)
    })
})
passport.use(new BearerStrategy(
  (token, done) => {
    console.log('Bearer Strategy Verifying...', token)
    admin.auth().verifyIdToken(token, true)
      .then(payload => {
        console.log(payload)
        // if (!user) { return done(null, false); }
        // return done(null, user, { scope: 'all' })
      })
      .catch(error => {
        if (error.code === 'auth/id-token-revoked') {
          // Token has been revoked. Inform the user to reauthenticate or signOut() the user.
          return done(error)
        } else {
          // Token is invalid.
          return done(error)
        }
      })
  }
))

// view engine setup
app.set('views', './views')
app.set('view engine', 'pug')
app.set('trust proxy', 1)

app.use(require('./src'))

// 404 Fallback
app.use((req, res, next) => {
  next(createError(404))
})

// Error Handling
app.use((err, req, res, next) => {
  res.status(err.status || 500)
  if (req.accepts('html') && app.get('env') === 'production') {
    res.locals.message = err.message
    res.locals.error = req.app.get('env') !== 'production' ? err : undefined
    res.render('error')
    return
  }
  if (req.accepts('json')) {
    res.send(err)
    return
  }

  res.send(err.message)
})

// Use connect method to connect to the Server
mongodb.connect(err => {
  if (err) {
    console.error('Cannot connect to MongoDB Server', err)
    return
  }
  console.log('Connected successfully to MongoDB server')
  // Listening to port on dev server
  const PORT = process.env.PORT || '3000'
  app.listen(PORT, () => {
    console.debug(`App listening on port ${PORT}`)
    console.debug('Press Ctrl+C to quit.')
  })
})
