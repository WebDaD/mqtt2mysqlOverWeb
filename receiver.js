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

const io = require ('socket.io')(server)
io.on ('connection', (socket) => {
  console.log ('client-connected: '+socket.id+' / total active connections: '+io.engine.clientsCount)
  socket.emit (config.receiver.socket.msg, {'data': 'you are connected to the server.'+config.receiver.socket.host+' on '+config.receiver.socket.path})
})


/*
var msgCount = 0;
setInterval( () => {
  console.log ('#'+(msgCount++)+': emitting message ...');
  io.sockets.emit (config.receiver.socket.msg, {'for':'just a test'})
}, 5000)
*/

const connection = mysql.createConnection(config.receiver.database)
try {
  connection.connect()
} catch (e) {
  console.error(e)
  process.exit(5)
}

const {spawn} = require('child_process')
var watchdogs = [] // array of watchdog-objects
var lastMessagesReceived = []



// Zugriffsrechte checken
try {
  fs.accessSync (config.receiver.store, fs.constants.W_OK);
} catch (e) {
  console.error (e);
  process.exit (6);
}


app.use(bodyParser.urlencoded({extended:true, limit: config.receiver.maxRequestSize})) // for parsing formdata

createTables(function () {
  var _server =  server.listen(config.receiver.port)
  // setting up watchdog(s) ...
  watchdogs.forEach ((watchdog, i) => {
    watchdog.timerObj = setTimeout(() => {watchdogFired (watchdog)}, parseInt(watchdog.prms.time)*60*1000)
    dumpMsg(` - watchdog #${i} for ${watchdog.for} armed. (${watchdog.prms.time} minutes.)`)
  })
  dumpMsg('startup: receiver running on port ' + config.receiver.port)
})


app.post(config.sender.post.path, function (req, res) {
  let decrypt = crypto.createDecipher('aes256', config.key)
  var decrypted = decrypt.update(req.body.data, 'hex', 'utf8')
  decrypted += decrypt.final()

  // dumpMsg ('message received.'); //:\n'+decrypted);
  let data = JSON.parse(decrypted)
  if (data.interpret !== undefined) {
    dumpMsg ('MUSIC-info received: ' + data.interpret + '  |  ' + data.title); //+'\n'+JSON.stringify(data, null,2));
  } else {
    dumpMsg ('MESSAGE received: '+ data.value);
  }

  
  watchdogs.forEach ( (wd) => {
    if (wd.for == data.table) {
      wd.timerObj.refresh()
      dumpMsg(` - RESET watchdog for ${wd.for}.`)
    }
  })


  let dbstructure = null;
  for (let i=0; i<config.dbstructure.length; i++) { 
    if (config.dbstructure[i].tables.indexOf(data.table) > -1) 
      dbstructure = config.dbstructure[i];
  }
  if (dbstructure === null)
    return dumpMsg ('ERROR: No DB-Table-Definition for topic "'+data.table+'"');

  let assignmentList = '';
  for (let i=0; i<dbstructure.fields.length; i++) {
    const field = dbstructure.fields[i].field;
    assignmentList += '`'+field+'`="'+data[field].toString().replace (/\"/g, '\\"')+'", ';
  }
  for (let i=0; i<dbstructure.files.length; i++) {
    const element = dbstructure.files[i];
    if (data[element.name] != '') {
      let _path = config.receiver.store + element.name;
      let elData = new Buffer.from (data[element.name], 'binary');
      dumpMsg (' - Checking Basepath: '+_path);
      if (!fs.existsSync (_path))
        fs.mkdirSync (_path, {recursive: true});
      let fn = _path + '/' + data.musicid + '.' + element.extension;
      dumpMsg (' - Saving file for *'+element.name+'*: '+fn);
      try {
        fs.writeFileSync(fn, elData);
        assignmentList += '`' + element.name + '`=1, '
      } catch(e) {
        dumpMsg (' - Error during writeFilySync(): \n' + e);
        assignmentList += '`' + element.name +'`=0, ';
      }
    } else {
      assignmentList += '`' + element.name + '`=0, '
    }
  }

  assignmentList = assignmentList.substr(0, assignmentList.length - 2)
  // let SQL = 'INSERT ' + (config.receiver.ignoreInsertError ? 'IGNORE' : '') + ' INTO ' + data.table + ' SET ' + assignmentList;
  let SQL = 'INSERT INTO ' + data.table + ' SET ' + assignmentList;
  connection.query(SQL, function (error, results, fields) {
    if (error) {
      dumpMsg (' - Fehler beim Insert: '+error+'SQL:\n'+SQL+'\nDetails: '+JSON.stringify(error, null, 2));
      // console.error(error)
      cache.data.push(data)
      cache.save()
      // res.status(500).end('error')
    } else {
        if (data.interpret !== undefined) {
          save2DB.savePlaylist (data, io);
        } else {
          console.log()
        }
    }

  })
})

// Warteschlange abarbeiten
setInterval(function () {
  for (let index = 0; index < cache.data.length; index++) {
    const data = cache.data[index]

    let dbstructure = null;
    for (let i=0; i<config.dbstructure.length; i++) {
      if (config.dbstructure[i].tables.indexOf(data.table) > -1)
        dbstructure = config.dbstructure[i];
    }
    if (dbstructure === null)
      return dumpMsg ('ERROR: No DB-Table-Definition for topic "'+data.table+'"');  

    let assignmentList = ''
    for (let index = 0; index < dbstructure.fields.length; index++) {
      const field = dbstructure.fields[index].field
      assignmentList += '`' + field + '`="' + data[field].toString().replace (/\"/g, '\\"') + '", '
    }
    for (let index = 0; index < dbstructure.files.length; index++) { // Save Files to Disk
      const element = dbstructure.files[index]
      let content = data[element.name]
      if (content !== '') {
        // checken, ob das Zielverzeichnis existiert ... (braucht's eigentlich nicht, weil das ja bereits eine Ebene drüber erschlagen wurde)
        let _path = config.receiver.store + element.name;
        dumpMsg (' + Checking Basepath: '+_path);
        if (!fs.existsSync (_path))
          fs.mkdirSync (_path, {recursive:true});
        let fn = _path + '/' + data.musicid + '.' + element.extension;
        dumpMsg (' + Retry saving file for *'+element.name+'*: '+fn);
        try {
          fs.writeFileSync(fn, content);
          assignmentList += '`' + element.name + '`=1, ';
        } catch (e) {
          dumpMsg (' + Still error during writeFilySync(): \n' + e);
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
        dumpMsg (' + Fehler beim erneuten Insert: '+error+'SQL:\n'+SQL);
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
  console.log('\nExiting...\n'+err);
  save2DB.stop();
  connection.end();
  for (watchdog of watchdogs) {
    clearTimeout(watchdog.timerObj);
  }
  process.exit();
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
  let dbstructure = null;

  for (let i=0; i<config.topics.length; i++) {
    // ggf. watchdog erzeugen
    if (config.topics[i].watchdog !== undefined) {
      watchdogs.push({for: config.topics[i].table, prms: config.topics[i].watchdog})
    }

    // DB-Definition raussuchen
    for (let j=0; j<config.dbstructure.length; j++) {
      if (config.dbstructure[j].tables.indexOf(config.topics[i].table) > -1)
        dbstructure = config.dbstructure[j];
    }
    // DB-Felder bearbeiten
    let fields = '';
    for (let j=0; j<dbstructure.fields.length; j++) {
      const field = dbstructure.fields[j];
      fields += '`'+field.field+'` '+field.type+' NOT NULL, ';
    }
    if (dbstructure.files.length < 1)
      fields = fields.substr (0, fields.length -2);
    
    let filefields = '';
    for (let j=0; j<dbstructure.files.length; j++) {
      const field = dbstructure.files[j];
      filefields += '`'+field.name+'` INT NOT NULL, ';
    } 
    if (filefields.length > 0)
      filefields = filefields.substr (0, filefields.length - 2);
    
    let indices = '';
    for (let j=0; j<dbstructure.indices.length; j++) {
      indices += '`'+dbstructure.indices[j]+'`, '
    }
    indices = ', INDEX ('+indices.substr(0, indices.length-2)+') ';

    let primary = '';
    for (let j=0; j<dbstructure.primary.length; j++) {
      primary += '`'+dbstructure.primary[j]+'`, ';
    }
    if (primary.length > 0) {
      primary = ', PRIMARY KEY ('+primary.substr(0, primary.length - 2)+')';
    }

    // Tabelle anlegen
    let SQL = 'CREATE TABLE IF NOT EXISTS '+config.topics[i].table+' (' + fields + filefields + indices +  primary + ')';
    SQL += ' ENGINE='+dbstructure.engine;
    if (dbstructure.partioning !== undefined) 
      SQL += ' PARTITION BY KEY (' + dbstructure.partioning.on + ') PARTITIONS ' + dbstructure.partioning.count + ''
    
    connection.query (SQL, (err, result) => {
      if (err) {
        console.error(err);
        process.exit(6)
      } else {
        count--
        if (count < 1) {
          callback()
        }
      }

    });

  } // für alle topics

} // /createTables()


const dumpMsg = (msg) => {
  if (config.receiver.debug) {
    let _t = new Date()
    let _st = _t.getHours().toString().padStart(2,'0') + ':' + _t.getMinutes().toString().padStart(2,'0') + ':' + _t.getSeconds().toString().padStart(2,'0') + ',' + _t.getMilliseconds().toString().padStart(3,'0')
    console.log (_st + '  ' + msg);
  }
}

const watchdogFired = (d) => {
  console.log ('d.for: '+d.for+'  /  prms: '+JSON.stringify(d.prms, null, 2))
  for (adr of d.prms.adr) {
    try {
      let sendmail = spawn(
        "mail", 
        [
          "-s",
          `RCV: Keine Titelaktualisierung für ${d.for} seit: ${d.prms.time} Minuten.`,
          adr
        ]
      );
      sendmail.stdin.write (d.prms.msg);
      sendmail.stdin.end();
      dumpMsg (`+++ Watchdog-Mail for topic ${d.for} sent to ${adr} +++`)
    } catch(err) {
      dumpMsg ('Error while sending watchdog-mail.')
    }
  }   //  /for adr of d.prms.adr

  // re-arm watchdog
  let _idx = watchdogs.findIndex( (el) => {return (el.for==d.for)})
  if (_idx > -1) {
    watchdogs[_idx].timerObj.refresh()
  }

}