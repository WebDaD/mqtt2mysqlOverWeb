const mqtt = require('mqtt')
const crypto = require('crypto')
const request = require('request')
const fs = require('fs')

let config = {}
if (process.argv[2]) {
  config = require(process.argv[2])
} else {
  config = require('./config.json')
}

// Proxy Settings
var myRequest
if (config.sender.proxy.active) {
  var proxyUrl = 'http://' + config.sender.proxy.user + ':' + config.sender.proxy.password + '@' + config.sender.proxy.host + ':' + config.sender.proxy.port
  myRequest = request.defaults({'proxy': proxyUrl})
} else {
  myRequest = request.defaults()
}

const client = mqtt.connect(config.sender.broker)

const CACHE = require('./lib/jsonfilecache')
let cache = CACHE.JsonFileCache(config.sender.cache)
cache.load()

client.on('connect', function () {
  for (let index = 0; index < config.topics.length; index++) {
    client.subscribe(config.topics[index].topic)
  }
})

client.on('message', function (topic, message) {
  let _t = new Date()
  var _st = (_t.getHours() < 10 ? '0' : '') + _t.getHours() + ':' + (_t.getMinutes() < 10 ? '0' : '') + _t.getMinutes() + ':' + (_t.getSeconds() < 10 ? '0' : '') + _t.getSeconds()
  console.log('-----\n' + _st + ': ' + topic + ': ')
  let msgJSON = {}
  try {
    msgJSON = JSON.parse(message.toString().replace(/\\/g, '')) // sonst Crash bei den maskierten chars
    console.log(msgJSON.class + ', ' + msgJSON.interpret + (msgJSON.interpret !== '' ? ':  ' : '') + msgJSON.title)
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
          let fn = element.folder + msgJSON[element.id] + '.' + element.extension
          console.log('looking for _' + element.name + '_: ' + fn)
          if (config.element.folder.match(/http[s]:\/\//)) { msgJSON[element.name] = request(fn).toString('binary') } else { msgJSON[element.name] = fs.readFileSync(fn, {'encoding': 'utf8'}).toString('binary') }
        } catch (e) {
          msgJSON[element.name] = ''
        }
      }
      const cipher = crypto.createCipher('aes256', config.key)
      let encrypted = cipher.update(JSON.stringify(msgJSON), 'utf8', 'hex')
      encrypted += cipher.final('hex')
      myRequest.post(config.sender.post.host + config.sender.post.path, {form: {data: encrypted.toString()}}, function (error, res, body) {
        if (error) {
          cache.data.push(msgJSON)
          console.error(error)
        } else {
          if (res.statusCode === 500) {
            cache.data.push(msgJSON)
            cache.save()
            console.error('Error on Post! ' + JSON.stringify(msgJSON))
          } else { console.log('Data sent to ' + config.sender.post.host) } // else all is OK
        }
      })
    }
  }
})
setInterval(function () {
  for (let index = 0; index < cache.data.length; index++) {
    const element = cache.data[index]
    const cipher = crypto.createCipher('aes256', config.key)
    let encrypted = cipher.update(JSON.stringify(element), 'utf8', 'hex')
    encrypted += cipher.final('hex')
    console.log('about to send via POST (setInterval()) ...')
    request.post(config.sender.post.host + config.sender.post.path, {form: {data: encrypted.toString()}}, function (error, res, body) {
      if (error) {
        console.error(error)
      } else {
        if (res.statusCode === 500) {
          console.error('Error on Post! ' + JSON.stringify(element))
        } else {
          cache.data.slice(index, 1)
          cache.save()
        }
      }
    })
  }
}, config.sender.cache.retry)
