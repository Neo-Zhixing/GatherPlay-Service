const redis = require('redis')
const { promisify } = require('util')
const config = require(process.env.NODE_ENV === 'production' ? '../config.json' : '../config_dev.json')

function Redis (url) {
  const client = redis.createClient(url)
  this.clinet = client
  const keywords = [
    'get',
    'set',
    'incr',
    'ttl',
  ]
  keywords.forEach(keyword => {
    this[keyword] = promisify(client[keyword]).bind(client)
  })

  client.on('error', err => {
    console.log(err)
  })
}

const MongoClient = require('mongodb').MongoClient

const client = new MongoClient(config.mongodbURL, {
  useNewUrlParser: true
})

exports.mongodb = client
exports.redis = new Redis(config.redisURL)
exports.config = config
