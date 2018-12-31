const Client = require('ftp')

module.exports = function(localFile, remoteFile) {
  const c = new Client()

  c.connect({
    user: 'jwreadinhe',
    password: 'agwxz2002',
    host: 'ftp.jwreading.com',
  })

  c.on('ready', () => {
    c.put(localFile, remoteFile, err => {
      if (err) {
        console.log('error with ftp upload', err)
      } else {
        console.log(`file ${localFile} transferred with success`)
      }
      c.end()
    })
  })

  c.on('error', err => {
    console.log('error with ftp connection', err)
  })
}
