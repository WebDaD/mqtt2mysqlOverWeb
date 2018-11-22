const mqtt = require('mqtt')
const xorCrypt = require('xor-crypt')
const request = require('request')
const config = require('./config.json')

const client = mqtt.connect(config.sender.broker)

client.on('connect', () => {
  client.subscribe(config.sender.topic)
})

// TODO: Wellen!

client.on('message', (topic, message) => {
  let data = xorCrypt(JSON.stringify(message), config.key)
  // TODO: get image from capri, into base64, into message
  request.post(config.sender.post.host + ':' + config.receiver.port, data, function (error, res, body) {
    if (error) {
      console.error(error)
    } else {
      if (res.statusCode === 500) {
        console.error('Error on Post! ' + JSON.stringify(message))
      } else {
        console.log('Post OK')
      }
    }
  })
})
