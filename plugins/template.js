process.on('message', (data) function () {
  // TODO: work with object data.data
  
  process.send({code: 0, type: 'done', data: data.data})
})