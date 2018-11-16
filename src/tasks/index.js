const express = require('express')
const router = express.Router()

router.use('/cleanup', require('./cleanup'))

module.exports = router
