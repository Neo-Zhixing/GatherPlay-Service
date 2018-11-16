const express = require('express')
const router = express.Router()

router.use('/spotify', require('./spotify'))
router.use('/tasks', require('./tasks'))

module.exports = router
