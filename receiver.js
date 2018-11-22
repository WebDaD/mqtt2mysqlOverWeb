const xorCrypt = require('xor-crypt')
const mysql = require('mysql')
const express = require('express')
const bodyParser = require('body-parser')
const app = express()
const server = require('http').createServer(app)
const config = require('./config.json')

const connection = mysql.createConnection(config.receiver.database)

app.use(bodyParser.json()) // for parsing application/json

app.post('/', function (req, res) {
  let data = JSON.parse(xorCrypt(req.body, config.key))
  // TODO: there is also a base64 Image in here, save it to file
  connection.query('INSERT 1', function (error, results, fields) { // TODO: SQL command
    if (error) {
      console.error(error)
      res.status(500).end('error')
    } else {
      res.status(200).end('ok')
    }
  })
})

server.listen(config.receiver.port)
