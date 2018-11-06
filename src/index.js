const express = require('express')
const router = express.Router()

router.use('/spotify', require('./spotify'))

module.exports = router
