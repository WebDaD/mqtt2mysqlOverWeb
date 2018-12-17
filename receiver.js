#!/usr/bin/env node

const crypto = require('crypto')
const mysql = require('mysql')
const express = require('express')
const fs = require('fs')
const bodyParser = require('body-parser')
//const childProcess = require('child_process')
const app = express()
//const queue = require('queue')
//let q = queue()
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

save2DB = require ('./plugins/save2DB');



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
  let data = JSON.parse(decrypted)
  console.log ('received: ' + data.interpret + '  |  ' + data.title);
  let assignmentList = ''
  for (let index = 0; index < config.structure.fields.length; index++) {
    const field = config.structure.fields[index].field
    assignmentList += '`' + field + '`="' + data[field] + '", '
  }
  for (let index = 0; index < config.structure.files.length; index++) { // Save Files to Disk
    const element = config.structure.files[index]
    let content = data[element.name]
    if (content !== '') {
      let fn = config.receiver.store + data[element.id] + '.' + element.extension, content;
      console.log ('Looking for cover: '+fn);
      fs.writeFileSync(fn);
      assignmentList += '`' + element.name + '`=1, '
    } else {
      assignmentList += '`' + element.name + '`=0, '
    }
  }
  assignmentList = assignmentList.substr(0, assignmentList.length - 2)
  connection.query('INSERT ' + (config.receiver.ignoreInsertError ? 'IGNORE' : '') + ' INTO ' + data.table + ' SET ' + assignmentList, function (error, results, fields) {
    if (error) {
      console.error(error)
      cache.data.push(data)
      cache.save()
      res.status(500).end('error')
    } else {
        save2DB.savePlaylist (data);
//      runAfterMath(config.receiver.aftermath, data)
    }
  })
})

setInterval(function () {
  for (let index = 0; index < cache.data.length; index++) {
    const element = cache.data[index]
    let assignmentList = ''
    for (let index = 0; index < config.structure.fields.length; index++) {
      const field = config.structure.fields[index].field
      assignmentList += '`' + field + '`="' + element[field] + '", '
    }
    for (let index = 0; index < config.structure.files.length; index++) { // Save Files to Disk
      const element = config.structure.files[index]
      let content = element[element.name]
      if (content !== '') {
        fs.writeFileSync(config.receiver.store + element[element.id] + '.' + element.extension, content)
        assignmentList += '`' + element.name + '`=1, '
      } else {
        assignmentList += '`' + element.name + '`=0, '
      }
    }
    assignmentList = assignmentList.substr(0, assignmentList.length - 2)
    connection.query('INSERT ' + (config.receiver.ignoreInsertError ? 'IGNORE' : '') + ' INTO ' + element.table + ' SET ' + assignmentList, function (error, results, fields) {
      if (error) {
        console.error(error)
      } else {
        cache.data.slice(index, 1)
        cache.save()
        save2DB.savePlaylist (data);
//        runAfterMath(config.receiver.aftermath, element)
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
  console.log('Exiting...')
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

/*
function runAfterMath (scripts, object) {
  for (let index = 0; index < config.receiver.aftermath.length; index++) {
    const script = config.receiver.aftermath[index]
    q.push(function (cb) {
      runScript(script, object, function (err, code, object) {
        if (err) {
          console.error(err)
          cb(err, code, object)
        } else {
          if (code !== 0) {
            console.error(script + ': exited with code ' + code)
            cb(err, code, object)
          } else {
            cb(err, code, object)
          }
        }
      })
    })
  }
  q.start(function (err) {
    if (err) {
      console.error(err)
    } else {
      q.end()
    }
  })
}


function runScript (scriptPath, object, callback) {
  // keep track of whether callback has been invoked to prevent multiple invocations
  var invoked = false

  var process = childProcess.fork(scriptPath)

  process.send({ data: object })

  // listen for errors as they may prevent the exit event from firing
  process.on('error', function (err) {
    if (!invoked) {
      invoked = true
      callback(err)
    }
  })

  // execute the callback once the process has finished running
  process.on('message', function (data) {
    if (!invoked) {
      invoked = true
      if (data.type === 'done') {
        callback(null, data.code, data.data)
      }
    }
  })
}

*/