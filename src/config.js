const redis = require('redis')
const { promisify } = require('util')

function Redis(url) {
  const client = redis.createClient(url)
  this.clinet = client
  this.get = promisify(client.get).bind(client)
  this.set = promisify(client.set).bind(client)
  this.incr = promisify(client.incr).bind(client)
  client.on('error', err => {
    console.log("Error " + err)
  })
}

exports.redis = new Redis(process.env.REDIS_URL)
