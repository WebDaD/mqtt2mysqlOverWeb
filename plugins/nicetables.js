process.on('message', (data) function () {
  createTables()
  // TODO: insert object in data into tables
  process.send({code: 0, type: 'done', data: data.data})
  process.exit(0)
})

function createTables() {
  // TODO: create Tables if not exist
}