const mqtt = require('mqtt');
const crypto = require('crypto');
const request = require('request');
const fs = require('fs');

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
  // Message für den Versand aufbereiten
  dumpMsg ('new message for: '+topic); // +'\n' + message+'\n');

  let msgJSON = {}
  // sonst Crash bei den maskierten chars, doppelte Anführungszeichen müssen aber maskiert bleiben
  strJSON = message.toString();
  strJSON = strJSON.replace (/\\'/g, "'").replace (/\\\"/g, '\"');
  try {
    msgJSON = JSON.parse(strJSON);
    dumpMsg ('msg parsed!  ==> (Class: ' + msgJSON.class + ', ' + msgJSON.interpret + (msgJSON.interpret !== '' ? ', "' : '') + msgJSON.title+'")');
  } catch (e) {
    dumpMsg ('ERROR while parsing to JSON\n'+strJSON+'\n Err:'+e+'\n');
    return console.error(e)
  }

  let filterpass = true
  for (let index = 0; index < config.filter.length; index++) {
    const filter = config.filter[index]
    switch (filter.operator) {
      case 'equals':
        filterpass = filter.values.indexOf(msgJSON[filter.field]) > -1
        break
      default: 
        dumpMsg ('Fehler mit dem Filter-Operator "'+filter.operator+'"');
        return console.error(filter.operator + ' is not defined.')
    }
  }
  if (filterpass) {
    for (let index = 0; index < config.topics.length; index++) {
      if (topic === config.topics[index].topic) {
        msgJSON.table = config.topics[index].table
      }
    }
    if (!msgJSON.table) {
      dumpMsg ('ERROR: No table for topic '+ topic);
    } 
    else {
      for (let index = 0; index < config.structure.files.length; index++) {
        const element = config.structure.files[index]
        try {
          let fn = element.folder + msgJSON[element.id] + '.' + element.extension
          dumpMsg ('INFO: trying to get *'+element.name+'* for: ' +fn + '('+msgJSON.interpret+', "'+msgJSON.title+'")');
          if (config.element.folder.match(/http[s]:\/\//)) { 
            msgJSON[element.name] = request(fn).toString('binary') 
          } else { 
            msgJSON[element.name] = fs.readFileSync(fn, {'encoding': 'utf8'}).toString('binary') 
          }
        } catch (e) {
          msgJSON[element.name] = ''
        }
      }

      const cipher = crypto.createCipher('aes256', config.key)
      let encrypted = cipher.update(JSON.stringify(msgJSON), 'utf8', 'hex')
      encrypted += cipher.final('hex');
      let postTarget = config.sender.post.host + config.sender.post.path;
      myRequest.post({url: postTarget, form: {data: encrypted.toString()}}, function (error, res, body) {
        if (error) {
          cache.data.push(msgJSON);
          cache.save();
          dumpMsg ('Error during initial transmit \n'+JSON.stringify(msgJSON, null, 2));
        } else {
          if (res.statusCode === 500) {
            cache.data.push(msgJSON);
            cache.save();
            dumpMsg ('Error during initial save on '+config.sender.post.host+'\n'+ JSON.stringify(msgJSON, null, 2));
          } else { 
            dumpMsg ('SUCCESS: Data sent >>> ' + config.sender.post.host + ' ('+msgJSON.interpret+')'); 
          } // else all is OK
        }
      })  // /myRequest.post()

    } //  / passendes topic
  } // /if (filterpass)
}) // / client.on (message ...)


// Warteschlange gescheiterter Transfers abarbeiten
setInterval(function () {
  for (let index = 0; index < cache.data.length; index++) {
    const element = cache.data[index]
    const cipher = crypto.createCipher('aes256', config.key)
    let encrypted = cipher.update(JSON.stringify(element), 'utf8', 'hex')
    encrypted += cipher.final('hex')
    dumpMsg ('retry:  --> "' + element.title + '" (' + element.interpret+') from '+element.timestamp);
    let postTarget = config.sender.post.host + config.sender.post.path;
    request.post({url: postTarget, form: {data: encrypted.toString()}}, function (error, res, body) {
      if (error) {
        dumpMsg ('Error during transmit: '+error);
      } else {
        if (res.statusCode === 500) {
          dumpMsg('Still Error during save on '+config.sender.post.host+'!\n' + JSON.stringify(element)+ '\n'+res.body+'\n');
        } else {
          dumpMsg ('SUCCESS: Data sent >>> ' + config.sender.post.host + ' (=> deleteFromQueue)'); 
          cache.data.shift(); // erstes Element der Queue löschen 
          cache.save();
        }
      }
    })
  }
}, config.sender.cache.retry);


const dumpMsg = (msg) => {
  if (config.sender.debug) {
    let _t = new Date()
    var _st = (_t.getHours() < 10 ? '0' : '') + _t.getHours() + ':' + (_t.getMinutes() < 10 ? '0' : '') + _t.getMinutes() + ':' + (_t.getSeconds() < 10 ? '0' : '') + _t.getSeconds()
    console.log (_st + '  ' + msg+'\n');
  }
}
