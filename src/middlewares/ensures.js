const createError = require('http-errors')

exports.ensureCronjob = function (req, res, next) {
  const header = req.get('X-Appengine-Cron')
  if (!header) {
    next(createError(403, 'This endpoint is for cronjobs only'))
    return
  }
  next()
}
