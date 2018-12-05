let jsonfilecache = function (settings) {
  this.jsonfile = require('jsonfile')
  this.file = settings.file
  this.saveInterval = settings.saveInterval
  this.data = []
  this.load()
  this.save = function () {
    this.jsonfile.writeFileSync(this.file, this.data)
  }
  this.load = function () {
    this.data = this.jsonfile.readFileSync(this.file)
  }
  setInterval(this.save, this.saveInterval)
}
module.exports = jsonfilecache
