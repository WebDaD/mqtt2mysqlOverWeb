const crypto = require('crypto')
const mysql = require('mysql')
const express = require('express')
const bodyParser = require('body-parser')
const app = express()
const server = require('http').createServer(app)
const config = require('./config.json')

const connection = mysql.createConnection(config.receiver.database)
try {
  connection.connect()
} catch (e) {
  console.error(e)
  process.exit(5)
}

app.use(bodyParser.urlencoded()) // for parsing formdata

createTables(function () {
  server.listen(config.receiver.port)
  console.log('receiver running on port ' + config.receiver.port)
})

app.post('/', function (req, res) {
  let decrypt = crypto.createDecipher('aes256', config.key)
  var decrypted = decrypt.update(req.body.data, 'hex', 'utf8')
  decrypted += decrypt.final()
  let data = JSON.parse(decrypted)
  // TODO: there is also a base64 Image in here, save it to file
  let assignmentList = ''
  for (let index = 0; index < config.structure.fields.length; index++) {
    const field = config.structure.fields[index].field
    assignmentList += field + '="' + data[field] + '", '
  }
  assignmentList = assignmentList.substr(0, assignmentList.length - 2)
  // TODO: do not insert doubles
  connection.query('INSERT INTO ' + data.table + ' SET ' + assignmentList, function (error, results, fields) {
    if (error) {
      console.error(error)
      res.status(500).end('error')
    } else {
      console.log('OK > ' + data.title) // FIXME: remove
      res.status(200).end('ok')
    }
  })
})

/** Handles exitEvents by destroying open connections first
 * @function
* @param {object} options - Some Options
* @param {object} err - An Error Object
*/
function exitHandler (options, err) {
  console.log('Exiting...')
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
    fields += field.field + ' ' + field.type + ' NOT NULL, '
  }
  if (config.structure.indices.length < 1) {
    fields = fields.substr(0, fields.length - 2)
  }
  let indices = ''
  for (let index = 0; index < config.structure.indices.length; index++) {
    const ind = config.structure.indices[index]
    indices += 'INDEX `' + ind + '_index` (`' + ind + '`), '
  }
  indices = indices.substr(0, indices.length - 2)
  for (let index = 0; index < config.topics.length; index++) {
    const table = config.topics[index].table
    let sql = 'CREATE TABLE IF NOT EXISTS ' + table + '( '
    sql += fields
    sql += indices
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
}