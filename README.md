# mqtt2mysqlOverWeb

2 Dienste, die, per HTTP verbunden, MQTT-Nachrichten in eine MySQL-Datenbank schreiben.

![Komponenten](/components.png)

## Install

1. `git clone https://github.com/WebDaD/mqtt2mysqlOverWeb /opt/`
2. `cd /opt/mqtt2mysqlOverWeb`
3. `npm install`

Dann noch in der Datenbank die passenden Tabellen anlegen

## Config

Zunächst die Datei `config.sample.json` in `config.json` umbenennen.

Dann die Werte anpassen.

## Control

Zum Starten einfach `node receiver.js` oder `node sender.js`.

Wobei ein ProcessManager wie [pm2](http://pm2.keymetrics.io/) empfohlen wird.
