# TODO

* multiple sender
* multiple receiver

* dispatcher on both sides

* config smaller

## Plugin: nicetables

tbl_songs
id (int, auto-increment) 
title (char(255))
artist (char(255))
titleID (aus Musicmaster)

tbl cover
id (int, auto-increment)
titleId (int -> tbl_songs_-> id)
path (char(255))
filename (char(60))

tbl_playlist
id (int, auto-increment)
titleId (tbl_songs ->id)
start (datetime)
length (time)
type (char (20) -> type: music, cart …)
comment (char (255) – wofür auch immer 😊)

## Erweiterungen

* other dbs (lib/mysql)
* other sender (not only mqtt)
* mysql2mqtt (reverse)