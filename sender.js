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
  let msgJSON = {}
  try {
    msgJSON = JSON.parse(message.toString())
  } catch (e) {
    console.error(message.toString())
    return console.error(e)
  }
  let filterpass = true
  for (let index = 0; index < config.filter.length; index++) {
    const filter = config.filter[index]
    switch (filter.operator) {
      case 'equals':
        filterpass = filter.values.indexOf(msgJSON[filter.field]) > -1
        break
      default: return console.error(filter.operator + ' is not defined.')
    }
  }
  if (filterpass) {
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
          msgJSON[element.name] = fs.readFileSync(element.folder + msgJSON[element.id] + '.' + element.extension).toString('binary')
        } catch (e) {
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
  }
})
