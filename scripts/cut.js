#!/usr/bin/env node

console.log('process entered')
require('../src/cut')(process.argv[2])
  .then(fileCreated => {
    console.log('process ended, file created:' + fileCreated)
  })
  .catch(err => console.log('error in script cut.js', err))
