let jsonfilecache = function (settings) {
  this.jsonfile = require('jsonfile')
  this.data = []
  this.saveInterval = undefined
  this.config = function (settings) {
    this.file = settings.file
    this.saveInterval = settings.saveInterval
  }
  this.save = function () {
    this.jsonfile.writeFileSync(this.file, this.data)
  }
  this.load = function () {
    this.data = this.jsonfile.readFileSync(this.file)
  }
  this.startAutoSave = function () {
    this.saveInterval = setInterval(this.save, this.saveInterval)
  }
  this.stopAutoSave = function () {
    clearInterval(this.saveInterval)
  }
}
module.exports = jsonfilecache
