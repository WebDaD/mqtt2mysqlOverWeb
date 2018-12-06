exports.JsonFileCache = function (settings) {
  this.jsonfile = require('jsonfile')
  this.file = settings.file
  this.saveInterval = settings.saveInterval
  this.data = []
  this.saveInterval = undefined
  this.save = function () {
    this.jsonfile.writeFileSync(this.file, this.data)
  }
  this.load = function () {
    try {
      this.data = this.jsonfile.readFileSync(this.file)
    } catch (e) {
      console.error('Could not Load From CacheFile')
    }
  }
  this.startAutoSave = function () {
    this.saveInterval = setInterval(this.save, this.saveInterval)
  }
  this.stopAutoSave = function () {
    clearInterval(this.saveInterval)
  }
  return this
}
