#!/usr/bin/env node

const cut = require('../src/cut')
const moment = require('moment')
const nodemailer = require('nodemailer')

console.log('process entered')
const lang = process.argv[2]
cut(lang)
  .then(async fileCreated => {
    console.log('process ended, file created: %s', fileCreated)
    const transporter = nodemailer.createTransport({
      host: 'SSL0.OVH.NET',
      port: 587,
      secure: false,
      auth: {
        user: 'contact@jwreading.com',
        pass: 'agwxz2002',
      },
    })
    const mailOptions = {
      from: '"Weekly Cut" <contact@jwreading.com>',
      to: 'contact@jwreading.com',
      subject: `Découpage lecture ${lang}`,
      html: `Découpage lecture ok.<br>Fichier créé: ${fileCreated}<br>Date: ${moment()
        .locale('fr')
        .format('LLLL')}`,
    }

    try {
      const { messageId } = await transporter.sendMail(mailOptions)
      console.log('message sent: %s', messageId)
    } catch (err) {
      console.log('error while sending mail', err)
    }
  })
  .catch(err => console.log('error in script cut.js', err))
