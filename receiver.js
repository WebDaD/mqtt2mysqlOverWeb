#!/usr/bin/env node

const crypto = require('crypto')
const mysql = require('mysql')
const express = require('express')
const fs = require('fs')
const bodyParser = require('body-parser')
const app = express()
const server = require('http').createServer(app)
let config = {}
if (process.argv[2]) {
  config = require(process.argv[2])
} else {
  config = require('./config.json')
}

const CACHE = require('./lib/jsonfilecache')
let cache = CACHE.JsonFileCache(config.receiver.cache)
cache.load()

const save2DB = require ('./plugins/save2DB');



const connection = mysql.createConnection(config.receiver.database)
try {
  connection.connect()
} catch (e) {
  console.error(e)
  process.exit(5)
}

// Zugriffsrechte checken
try {
  fs.accessSync (config.receiver.store, fs.constants.W_OK);
} catch (e) {
  console.error (e);
  process.exit (6);
}


app.use(bodyParser.urlencoded({extended:true})) // for parsing formdata

createTables(function () {
  server.listen(config.receiver.port)
  console.log('receiver running on port ' + config.receiver.port)
})


app.post(config.sender.post.path, function (req, res) {
  let decrypt = crypto.createDecipher('aes256', config.key)
  var decrypted = decrypt.update(req.body.data, 'hex', 'utf8')
  decrypted += decrypt.final()

  dumpMsg ('message received.'); //:\n'+decrypted);
  let data = JSON.parse(decrypted)
  dumpMsg ('message parsed: ' + data.interpret + '  |  ' + data.title); //+'\n'+JSON.stringify(data, null,2));
  let assignmentList = ''
  for (let index = 0; index < config.structure.fields.length; index++) {
    const field = config.structure.fields[index].field
    assignmentList += '`' + field + '`="' + data[field].toString().replace (/\"/g, '\\"') + '", '
  }
  for (let index = 0; index < config.structure.files.length; index++) { // Save Files to Disk
    const element = config.structure.files[index]
    let content = data[element.name]
    if (content !== '') {
      // checken, ob das Zielverzeichnis existiert ...
      let _path = config.receiver.store + element.name;
      dumpMsg ('Checking Basepath: '+_path);
      if (!fs.existsSync (_path))
        fs.mkdirSync (_path, {recursive:true});
      let fn = _path + '/' + data.musicid + '.' + element.extension;
      dumpMsg ('Saving file for *'+element.name+'*: '+fn);
      try {
        fs.writeFileSync(fn, content);
        assignmentList += '`' + element.name + '`=1, '
      } catch(e) {
        dumpMsg ('Error during writeFilySync(): \n' + e);
        assignmentList += '`' + element.name +'`=0, ';
      }
    } else {
      assignmentList += '`' + element.name + '`=0, '
    }
  }
  assignmentList = assignmentList.substr(0, assignmentList.length - 2)
  let SQL = 'INSERT ' + (config.receiver.ignoreInsertError ? 'IGNORE' : '') + ' INTO ' + data.table + ' SET ' + assignmentList;
  connection.query(SQL, function (error, results, fields) {
    if (error) {
      dumpMsg ('Fehler beim Insert: '+error+'SQL:\n'+SQL);
      console.error(error)
      cache.data.push(data)
      cache.save()
      res.status(500).end('error')
    } else {
        save2DB.savePlaylist (data);
    }
  })
})

// Warteschlange abarbeiten
setInterval(function () {
  for (let index = 0; index < cache.data.length; index++) {
    const data = cache.data[index]
    let assignmentList = ''
    for (let index = 0; index < config.structure.fields.length; index++) {
      const field = config.structure.fields[index].field
      assignmentList += '`' + field + '`="' + data[field].toString().replace (/\"/g, '\\"') + '", '
    }
    for (let index = 0; index < config.structure.files.length; index++) { // Save Files to Disk
      const element = config.structure.files[index]
      let content = data[element.name]
      if (content !== '') {
        // checken, ob das Zielverzeichnis existiert ... (braucht's eigentlich nicht, weil das ja bereits eine Ebene drüber erschlagen wurde)
        let _path = config.receiver.store + element.name;
        dumpMsg ('Checking Basepath: '+_path);
        if (!fs.existsSync (_path))
          fs.mkdirSync (_path, {recursive:true});
        let fn = _path + '/' + data.musicid + '.' + element.extension;
        dumpMsg ('Retry saving file for *'+element.name+'*: '+fn);
        try {
          fs.writeFileSync(fn, content);
          assignmentList += '`' + element.name + '`=1, ';
        } catch (e) {
          dumpMsg ('Still error during writeFilySync(): \n' + e);
          assignmentList += '`' + element.name +'`=0, ';
        }
      } else {
        assignmentList += '`' + element.name + '`=0, '
      }
    }
    assignmentList = assignmentList.substr(0, assignmentList.length - 2)
    let SQL = 'INSERT ' + (config.receiver.ignoreInsertError ? 'IGNORE' : '') + ' INTO ' + data.table + ' SET ' + assignmentList;
    connection.query(SQL, function (error, results, fields) {
      if (error) {
        dumpMsg ('Fehler beim erneuten Insert: '+error+'SQL:\n'+SQL);
        console.error(error);
      } else {
        // hat geklappt
        cache.data.shift(); // erstes Element aus dem Cache entfernen
        cache.save()
        save2DB.savePlaylist (data);
      }
    })
  }
}, config.receiver.cache.retry)

/** Handles exitEvents by destroying open connections first
 * @function
* @param {object} options - Some Options
* @param {object} err - An Error Object
*/
function exitHandler (options, err) {
  console.log('Exiting...\n'+err);
  save2DB.stop();
  connection.end()
  process.exit()
}
// catches ctrl+c event
process.on('SIGINT', exitHandler)
// catches uncaught exceptions
process.on('uncaughtException', function (err) {
  console.error(err)
  exitHandler(null, err)
})

// keep running
process.stdin.resume()

function createTables (callback) {
  let tables = config.topics.length
  let count = tables
  let fields = ''
  for (let index = 0; index < config.structure.fields.length; index++) {
    const field = config.structure.fields[index]
    fields += '`' + field.field + '` ' + field.type + ' NOT NULL, '
  }
  if (config.structure.files.length < 1) {
    fields = fields.substr(0, fields.length - 2)
  }
  let filefields = ''
  for (let index = 0; index < config.structure.files.length; index++) {
    const field = config.structure.files[index]
    filefields += '`' + field.name + '` INT NOT NULL, '
  }
  if (config.structure.indices.length < 1) {
    filefields = filefields.substr(0, filefields.length - 2)
  }
  let indices = ''
  for (let index = 0; index < config.structure.indices.length; index++) {
    const ind = config.structure.indices[index]
    indices += 'INDEX `' + ind + '_index` (`' + ind + '`), '
  }
  if (config.structure.primary.length < 1) {
    indices = indices.substr(0, indices.length - 2)
  }
  let primarchs = 'PRIMARY KEY ('
  for (let index = 0; index < config.structure.primary.length; index++) {
    const pri = config.structure.primary[index]
    primarchs += '`' + pri + '`, '
  }
  primarchs = primarchs.substr(0, primarchs.length - 2)
  primarchs += ')'
  for (let index = 0; index < config.topics.length; index++) {
    const table = config.topics[index].table
    let sql = 'CREATE TABLE IF NOT EXISTS ' + table + '( '
    sql += fields
    sql += filefields
    sql += indices
    sql += primarchs
    sql += ') ENGINE=InnoDB PARTITION BY KEY(' + config.structure.partioning.on + ') PARTITIONS ' + config.structure.partioning.count + ''
    connection.query(sql, function (error, results, fields) {
      if (error) {
        console.error(error)
        process.exit(6)
      } else {
        count--
        if (count < 1) {
          callback()
        }
      }
    })
  }
} // /createTables()


const dumpMsg = (msg) => {
  if (config.receiver.debug) {
    let _t = new Date()
    var _st = (_t.getHours() < 10 ? '0' : '') + _t.getHours() + ':' + (_t.getMinutes() < 10 ? '0' : '') + _t.getMinutes() + ':' + (_t.getSeconds() < 10 ? '0' : '') + _t.getSeconds()
    console.log (_st + '  ' + msg);
  }
}
