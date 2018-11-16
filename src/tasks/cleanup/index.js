const express = require('express')
const router = express.Router()
const { ensureCronjob } = require('../../middlewares/ensures')

router.get('/anonymous-users', ensureCronjob, require('./AnonymousUsers'))

module.exports = router
