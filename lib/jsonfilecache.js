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
      if (e.errno === -2) 
        console.log ('INFO: No cache file (i.e. cache is empty)');
      else
        console.log ('ERROR:\n'+e);
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
