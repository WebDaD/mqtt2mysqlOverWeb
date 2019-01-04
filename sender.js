const mqtt = require('mqtt');
const crypto = require('crypto');
const request = require('request');
const fs = require('fs');

let config = {}
if (process.argv[2]) {
  config = require(process.argv[2])
  console.log('Using Config ' + process.argv[2])
} else {
  config = require('./config.json')
  console.log('Using Config config.json')
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
  dumpMsg ('message received from: '+topic); // +'\n' + message+'\n');

  let msgJSON = {}
  // sonst Crash bei den maskierten chars, doppelte Anführungszeichen müssen aber maskiert bleiben
  strJSON = message.toString();
  strJSON = strJSON.replace (/\\'/g, "'").replace (/\\\"/g, '\"');
  try {
    msgJSON = JSON.parse(strJSON);
    if (msgJSON.class !== undefined)
      dumpMsg ('message parsed!  ==> (Class: ' + msgJSON.class + ', ' + msgJSON.interpret + (msgJSON.interpret !== '' ? ', "' : '') + msgJSON.title+'")');
    else 
      dumpMsg ('message parsed ==> (Tag: '+msgJSON.tag+ ' - "' + msgJSON.value+'")');
  } catch (e) {
    dumpMsg ('ERROR while parsing to JSON\n'+strJSON+'\n Err:'+e+'\n');
    return console.error(e)
  }

  // Behandlung abhängig vom Datentyp
  for (let i=0; i<config.topics.length; i++) {
    if (topic === config.topics[i].topic)
      msgJSON.table = config.topics[i].table;
  }

  let filterpass=true;
  let dbstructure = null;
  for (let i=0; i<config.dbstructure.length; i++){
    // DB-Definition zum topic suchen
    if (config.dbstructure[i].tables.indexOf (msgJSON.table) > -1) {
      dbstructure = config.dbstructure[i];      
    }
  }

  if (dbstructure === null) {
    dumpMsg ('ERROR: No table-definition for topic '+topic+' found.');
    return console.error ('No table for '+topic);
  }

  for (let i=0; i<dbstructure.filter.length; i++) {
    let filter = dbstructure.filter[i];
    switch (filter.operator) {
      case 'equals':
        filterpass = filter.values.indexOf(msgJSON[filter.field]) > -1;
        break;
      default:
        dumMsp ('ERROR: Filter-Operator "'+filter.operator+'" not defined.');
        return console.error ('ERROR: Filter-Operator "'+filter.operator+'"  not defined.');
    }
  }

  if (filterpass) {
    // ggf. nach Files suchen ...
    for (let i=0; i<dbstructure.files.length; i++) {
      let element = dbstructure.files[i];
      try {
        let fn = element.folder + msgJSON[element.id] + '.' + element.extension
        dumpMsg ('INFO: trying to get *'+element.name+'* for: ' +fn + '('+msgJSON.interpret+', "'+msgJSON.title+'")');
        if (element.folder.match(/http[s]:\/\//)) { 
          msgJSON[element.name] = request(fn).toString('binary') 
        } else { 
          msgJSON[element.name] = fs.readFileSync(fn).toString('binary') 
        }
      } catch (e) {
        msgJSON[element.name] = ''
      }
    }

    // Jetzt versenden
    const cipher = crypto.createCipher('aes256', config.key)
    let encrypted = cipher.update(JSON.stringify(msgJSON), 'utf8', 'hex')
    encrypted += cipher.final('hex');
    let postTarget = config.sender.post.host + config.sender.post.path;
    if (msgJSON.class !== undefined) {
      dumpMsg('Starting Transfer for (Class: ' + msgJSON.class + ', ' + msgJSON.interpret + (msgJSON.interpret !== '' ? ', "' : '') + msgJSON.title+'")')
    } else {
      dumpMsg('Starting Transfer for (Tag: '+msgJSON.tag+ ' - "' + msgJSON.value+'")')
    }
    
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
          dumpMsg ('SUCCESS: Data sent >>> ' + config.sender.post.host + ' ('+(msgJSON.interpret!==undefined ? msgJSON.interpret : msgJSON.value)+')'); 
        } // else all is OK
      }
    })  // /myRequest.post()

  } //  /if (filterpass)
  else {
    dumpMsg ('message discarded. ('+msgJSON.class+')');
  }
  
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
    myRequest.post({url: postTarget, form: {data: encrypted.toString()}}, function (error, res, body) {
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
    console.log (_st + '  ' + msg);
  }
}
