const redis = require('redis')
const { promisify } = require('util')

const config = require(process.env.NODE_ENV === 'development' ? '../config_dev.json' : '../config.json')

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
exports.redis = new Redis(process.env.redisURL)
exports.config = config
