const mqtt = require('mqtt')
const crypto = require('crypto')
const request = require('request')
const fs = require('fs')
const config = require('./config.json')

const client = mqtt.connect(config.sender.broker)

client.on('connect', function () {
  for (let index = 0; index < config.topics.length; index++) {
    client.subscribe(config.topics[index].topic)
  }
})

client.on('message', function (topic, message) {
  let msgJSON = JSON.parse(message.toString())
  for (let index = 0; index < config.topics.length; index++) {
    if (topic === config.topics[index].topic) {
      msgJSON.table = config.topics[index].table
    }
  }
  if (!msgJSON.table) {
    console.error('No Table for Topic: ' + topic)
  } else {
    for (let index = 0; index < config.structure.files.length; index++) {
      const element = config.structure.files[index]
      try {
        msgJSON[element.name] = fs.readFileSync(element.folder + msgJSON[element.id] + '.' + element.extension)
      } catch () {
        msgJSON[element.name] = ''
      }
    }
    const cipher = crypto.createCipher('aes256', config.key)
    let encrypted = cipher.update(JSON.stringify(msgJSON), 'utf8', 'hex')
    encrypted += cipher.final('hex')
    request.post(config.sender.post.host + ':' + config.receiver.port, {form: {data: encrypted.toString()}}, function (error, res, body) {
      if (error) {
        console.error(error)
      } else {
        if (res.statusCode === 500) {
          console.error('Error on Post! ' + JSON.stringify(msgJSON))
        } // else all is OK
      }
    })
  }
})
