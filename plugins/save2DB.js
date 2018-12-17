const config = require ("../config"),
  mysql = require ("../node_modules/mysql");

dbConf = config.receiver['save2DB.js'].database;
var hDB = mysql.createConnection(dbConf);
try {
  hDB.connect()
} catch (e) {
  console.error(e)
  process.exit(5)
}

module.exports.stop = () => {
  hDB.end();
}


module.exports.savePlaylist = (data) => {
  data.timestamp = data.timestamp.match (/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/gm);
  console.log ('cover: '+data.cover+'*****');


  data.intent = 'Artist';
  data.dbQuery = 'select * from `'+dbConf.database+'`.`artists` where artist="'+data.interpret+'"';
  data.dbInsert = 'insert into `'+dbConf.database+'`.`artists` (artist) values ("'+data.interpret+'")';
  data.returnValue = 0;
  _getArtistID (data).then ( (id) => {
    data['artistID'] = id;
    _getCoverID (data).then ( (id) => {
      data['coverID'] = id;
      _getTitleID (data).then ( (id) => {
        data['titleID'] = id;
        // Playlist updaten
        _getPlaylistID (data).then ( (id) => {
          console.log (' ----- ');
        }); 
      });   
    });
    
  }).catch ((err) => {
    console.log (err);
  })
//  console.log ('\n----\n'+JSON.stringify(data, null, 2));
};



let store2DB = (data) => {
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






// ---------------------
var _getArtistID = (data) => {
//  console.log ("_getArtistID () für "+data.interpret);
//  console.log (JSON.stringify(data, null, 2));
  let SQL = 'select id from `'+dbConf.database+'`.`artists` where artist="'+data.interpret+'"';
  return new Promise ((resolve, reject) => {
    hDB.query (SQL, (err, result, fields) => {
      if (err) {
        console.log ('Fehler: '+err);
        reject (err);
      }
      else {
        if (result.length > 0) {
          resolve (result[0].id);
        }
        else {
          SQL = 'insert into `'+dbConf.database+'`.`artists` (artist) values ("'+data.interpret+'")';
          hDB.query (SQL, (err, result, fields) => {
            if (err) {
              console.log ('Fehler beim Anlegen des Künstlers: '+err);
              reject (err);
            }
            else {
              console.log ('Artist created: '+data.interpret+' ('+result.insertId+')');
              resolve (result.insertId);
            }
          });
        }
      }
    });

  });
};  // /_getArtistID ()

// ---------------------
var _getCoverID = (data) => {
//  console.log ("_getCoverID () für "+data.cover);
//  console.log (JSON.stringify(data, null, 2));
  let SQL = 'select musicID from `'+dbConf.database+'`.`cover` where musicID="'+data.musicid+'"';
  return new Promise ((resolve, reject) => {
    hDB.query (SQL, (err, result, fields) => {
      if (err) {
        console.log ('Fehler: '+err);
        reject (err);
      }
      else {
        if (result.length > 0) {
          resolve (result[0].musicID);
        }
        else {
          if (data.cover != "") {
            SQL = 'insert into `'+dbConf.database+'`.`cover` (musicID, cover) values ("'+data.musicid+'", "'+data.cover+'")';
            hDB.query (SQL, (err, result, fields) => {
              if (err) {
                console.log ('Fehler beim Anlegen des Covers: '+err);
                reject (err);
              }
              else {
                resolve (result.insertId);
              }
            });
          } // Cover vorhanden
          else {
            resolve (0);  // gibt kein Cover
          } 
        }
      }
    });

  });
};  // /_getCoverID ()

// ---------------------
var _getTitleID = (data) => {
//  console.log ("_getTitleID () für "+data.title);
//  console.log (JSON.stringify(data, null, 2));
  let SQL = 'select musicID from `'+dbConf.database+'`.`titles` where musicID="'+data.musicid+'"';
  return new Promise ((resolve, reject) => {
    hDB.query (SQL, (err, result, fields) => {
      if (err) {
        console.log ('Fehler: '+err);
        reject (err);
      }
      else {
        if (result.length > 0) {
          console.log ('titleID für "'+data.title+'" von  '+data.interpret+'   -->  '+result[0].musicID);
          resolve (result[0].musicID);
        }
        else {
          SQL = 'insert into `'+dbConf.database+'`.`titles` (musicID, artistID, title, length, coverID) values ("'+data.musicid+'", '+data.artistID+', "'+data.title+'", "'+data.duration+'", '+data.coverID+')';
          hDB.query (SQL, (err, result, fields) => {
            //console.log ('Title:\n'+SQL);
            if (err) {
              console.log ('Fehler beim Anlegen des Titels: \n'+SQL+'\n'+err);
              reject (err);
            }
            else {
              console.log ('Title created: "'+data.title+'" ('+data.musicid+')');
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
//  console.log ("_getPlaylistID () für "+data.timestamp+' in '+data.table);  
//  console.log (JSON.stringify(data, null, 2));
  let SQL = 'select start from `'+dbConf.database+'`.`playlists` where start="'+data.timestamp+'" and station="'+data.table+'"';
  return new Promise ((resolve, reject) => {
    hDB.query (SQL, (err, result, fields) => {
      if (err) {
        console.log ('Fehler: '+err);
        reject (err);
      }
      else {
        if (result.length > 0) {
          resolve (result[0].musicID);
        }
        else {
          SQL = 'insert into `'+dbConf.database+'`.`playlists` (musicID, start, duration, class, station) values ("'+data.musicid+'", "'+data.timestamp+'", "'+data.duration+'", "'+data.class+'", "'+data.table+'")';
          hDB.query (SQL, (err, result, fields) => {
            //console.log ('Playlist-Eintrag:\n'+SQL);
            if (err) {
              console.log ('Fehler beim Anlegen des Playlist-Eintrags: '+err);
              reject (err);
            }
            else {
              console.log ('Playlist-Eintrag für '+data.table+' um '+data.timestamp);
              resolve (result.insertId);
            }
          });
        }

      }
    });

  });
};  //  /_getPlaylistID()


const queryDB = (SQL) => {
  return new Promise ( (resolve, reject) => {
    hDB.query (SQL, (err, result) => {
      if (err) {
        console.log ('Fehler beim Erstellen der Tabelle:\n'+SQL+'\n'+err);
        reject (err);
      }
      else {
        resolve (result.insertId);
      }
    });
  }); //  /promise
};

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

createTables();