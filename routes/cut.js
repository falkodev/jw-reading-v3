const express = require('express')
const router = express.Router()
const cut = require('../src/cut')

router.get('/:lang', async function(req, res, next) {
  req.setTimeout(5 * 60 * 1000)
  res.setTimeout(5 * 60 * 1000)

  const createdFile = await cut(req.params.lang)

  res.send('Created file:' + createdFile)
})

module.exports = router
