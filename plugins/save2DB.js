const config = require ("../config"),
  mysql = require ("../node_modules/mysql"),
  {spawn} = require("child_process");

dbConf = config.receiver['save2DB.js'].database;
var hDB = mysql.createConnection(dbConf);
try {
  hDB.connect();
} catch (e) {
  console.error(e);
  process.exit(5);
}

/*
// Socket-Kommunikation
console.log ('Creating SocketIO-Connection to '+config.receiver.socket.host+' on '+config.receiver.socket.path+' waiting for "'+config.receiver.socket.msg+'"')
const io = require ('socket.io-client')
const socket = io.connect (config.receiver.socket.host, {path: config.receiver.socket.path, transports: ['websocket'], rejectUnauthorized: false})
// transports is important. See: https://github.com/socketio/socket.io/issues/1995

socket.on ('connect', () => {
  console.log ('connection established.')
})

// setInterval( () => {
//   console.log ('Sending message ...')
//   socket.emit (config.receiver.socket.msg, {for: 'BAYERN3'})
// }, 10000)
  

socket.on ('connect_error', (err) => {
  console.log ('Connection-Error: '+JSON.stringify(err, null, 2))
})

socket.on ('diconnected', () => {
  console.log ('disconnected: '+socket.disconneted)
})

// socket.on (config.receiver.socket.msg, (data) => {
//   console.log ('Received "'+config.receiver.socket.msg+'"-message from server.\nData: '+JSON.stringify (data, null, 2))
// })
*/



/**************************************
 * 
 *  Promises 
 * 
 */

// ---------------------
var _getArtistID = (data) => {
//  dumpMsg ("_getArtistID () für "+data.interpret);
  let SQL = 'select id from `'+dbConf.database+'`.`artists` where artist="'+data.interpret+'"';
  return new Promise ((resolve, reject) => {
    hDB.query (SQL, (err, result, fields) => {
      if (err) {
        dumpMsg ('getArtist(): ERROR\n'+err);
        reject (err);
      }
      else {
        if (result.length > 0) {
          dumpMsg ('Artist found. '+data.interpret+'  -->  '+result[0].id);
          resolve (result[0].id);
        }
        else {
          SQL = 'insert into `'+dbConf.database+'`.`artists` (artist) values ("'+data.interpret+'")';
          hDB.query (SQL, (err, result, fields) => {
            if (err) {
              dumpMsg ('ERROR during artist-creation\n'+err);
              reject (err);
            }
            else {
              dumpMsg ('Artist created: '+data.interpret+' ('+result.insertId+')');
              resolve (result.insertId);
            }
          });
        }
      }
    });

  });
};  // /_getArtistID ()


// ---------------------
var _getTitleID = (data) => {
//  dumpMsg ("_getTitleID () für "+data.title);
  let SQL = 'select musicID from `'+dbConf.database+'`.`titles` where musicID="'+data.musicid+'"';
  return new Promise ((resolve, reject) => {
    hDB.query (SQL, (err, result, fields) => {
      if (err) {
        dumpMsg ('ERROR: _getTitle()\n'+err);
        reject (err);
      }
      else {
        if (result.length > 0) {
          dumpMsg ('Title found. "'+data.title+'" by '+data.interpret+'   -->  '+result[0].musicID);
          resolve (result[0].musicID);
        }
        else {
//          console.log ('Vorm Anlegen eines neuen Titels:\ngesucht: '+SQL+'\nresult:\n'+JSON.stringify(result, null, 2)+'\n---\n');
          SQL = 'insert into `'+dbConf.database+'`.`titles` (musicID, artistID, title, length, coverID) values ("'+data.musicid+'", '+data.artistID+', "'+data.title+'", "'+data.duration+'", '+(data.cover!=="" ? 1 : 0)+')';
          hDB.query (SQL, (err, result, fields) => {
            dumpMsg ('title: '+data.title+' not found.'); //\nresult:'+JSON.stringify(result, null, 2));
            if (err) {
              dumpMsg ('ERROR during title-creation.\n'+SQL+'\n'+err);
              reject (err);
            }
            else {
              dumpMsg ('Title created: "'+data.title+'" ('+data.musicid+')');
              resolve (data.musicid);
            }
          });
        }

      }
    });

  });
};  //  /_getTitleID()

// ---------------------
var _getPlaylistID = (data) => {
//  dumpMsg ("_getPlaylistID () für "+data.timestamp+' in '+data.table);  
  let SQL = 'select start, station from `'+dbConf.database+'`.`playlists` where start="'+data.timestamp+'" and station="'+data.table+'"';
  return new Promise ((resolve, reject) => {
    hDB.query (SQL, (err, result, fields) => {
      if (err) {
        console.log ('ERROR: _getPlaylistID()\n'+err);
        reject (err);
      }
      else {
        if (result.length > 0) {
          dumpMsg ('Found Playlist-Entry for '+data.timestamp+' on station: '+data.table);
          resolve (result[0].start +' / ' + result[0].station);
        }
        else {
          SQL = 'insert into `'+dbConf.database+'`.`playlists` (musicID, start, duration, class, station) values ("'+data.musicid+'", "'+data.timestamp+'", "'+data.duration+'", "'+data.class+'", "'+data.table+'")';
          hDB.query (SQL, (err, result, fields) => {
            //console.log ('Playlist-Eintrag:\n'+SQL);
            if (err) {
              dumpMsg ('ERROR during creation of playlist-entry.\n'+err);
              reject (err);
            }
            else {
              let deltaTime = (Date.now() - Date.parse(data.timestamp)) / 1000;
              dumpMsg (`Playlist-Entry for ${data.table} at ${data.timestamp} created. Delay: ${deltaTime} secs.`);
              if (deltaTime > parseInt(config.receiver["save2DB.js"].alarms.timeThreshold)) {
                dumpMsg (`Sending alarm-mail to ${config.receiver["save2DB.js"].alarms.emailAddress}`)
                try {
                  let sendmail = spawn(
                    "mail", 
                    [
                      "-s",
                      "mqtt2MySQL: Message delayed: "+deltaTime+" seconds",
                      config.receiver["save2DB.js"].alarms.emailAddress
                    ]
                  );
                  sendmail.stdin.write (
                    `Playlist Entry: "${data.title}" by ${data.interpret}\nfor ${data.table}, started at ${data.timestamp}, Entry delayed by ${deltaTime} secs.`
                  );
                  sendmail.stdin.end();
                } catch(err) {
                  dumpMsg ('Error while sending alarm-mail.')
                }
              }
              resolve (true); 
            }
          });
        }

      }
    });

  });
};  //  /_getPlaylistID()


let write2DB = (data) => {
  console.log ('Promise-Constructor called for: '+data.intent);
  return new Promise ( (resolve, reject) => {
    hDB.query (data.dbQuery, (err, result) => {
      if (err) {
        console.log ('Fehler: '+err);
        reject (err);
      }
      else {
        if (result.length > 0 && result[0][data.returnVal] != 'undefined')
         resolve (result[0][data.returnVal]);
        else {
          hDB.query (data.dbInsert, (err, result) => {
            if (err) {
              console.log ('Fehler beim Anlegen: '+data.intent+'\n'+err);
              reject (err);
            }
            else {
              // Anlegen hat geklappt -> 
              resolve ();
            }
          })
        }
      }
    })
  })
}


const queryDB = (SQL) => {
  return new Promise ( (resolve, reject) => {
    hDB.query (SQL, (err, result) => {
      if (err) {
        dumpMsg ('Error during db-request.\nSQL: '+SQL+'\nERROR: '+err);
        reject (err);
      }
      else {
        resolve (result.insertId);
      }
    });
  }); //  /promise
};

/**************************************
 * 
 *  Ende Promises 
 * 
 */




const createTables = () => {
  for (var i=0; i<config.receiver["save2DB.js"].tables.length; i++) {
    SQL = 'CREATE TABLE IF NOT EXISTS `'+config.receiver.database.database+'`.`'+config.receiver["save2DB.js"].tables[i].name+'` (';
    for (var j=0; j<config.receiver["save2DB.js"].tables[i].fields.length; j++) {
      let field = config.receiver["save2DB.js"].tables[i].fields[j];
      SQL += '`'+field.bez+'` '+field.type+' '+field.parms+', ';
    }
    SQL += config.receiver["save2DB.js"].tables[i].indices + ') Engine = ' + config.receiver["save2DB.js"].tables[i].engine;
    
    queryDB (SQL).then ((id) => {
    }).catch ( (err) => {
      console.log (err);
    });
  } //  /for i=0; i< tables.length
};  // createTables()


const dumpMsg = (msg) => {
  if (config.receiver.debug) {
    let _t = new Date()
    var _st = (_t.getHours() < 10 ? '0' : '') + _t.getHours() + ':' + (_t.getMinutes() < 10 ? '0' : '') + _t.getMinutes() + ':' + (_t.getSeconds() < 10 ? '0' : '') + _t.getSeconds() + ',' + _t.getMilliseconds()
    console.log (_st + '  ' + msg);
  }
}


createTables();



module.exports.stop = () => {
  hDB.end();
}

module.exports.savePlaylist = (data, socket=undefined) => {
  data.timestamp = data.timestamp.match (/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/gm);
  
  _getArtistID(data).then ( (id) => {
    data['artistID'] = id;
    _getTitleID (data).then ( (id) => {
      data['titleID'] = id;
      // Playlist updaten ...
      _getPlaylistID (data).then ( (id) => {
        dumpMsg('_getPlaylist(): '+id +  (socket===undefined || (socket !== undefined && id !== true) ? '\n *****': ''))
        if (id === true && socket !== undefined) {
          dumpMsg('Emitting message "'+config.receiver.socket.msg+'" to clients for "'+data.table+'" ('+data.interpret+' / "'+data.title+'")\n-----');
          socket.sockets.emit (config.receiver.socket.msg, {'for': data.table});
        }
      }); // Playlist gespeichert
    }); // Titel angelegt bzw. gefunden
  }).catch ((err) => {
    dumpMsg ('Error during save2DB:\n'+err);
  });

};  //  /savePlaylist()


