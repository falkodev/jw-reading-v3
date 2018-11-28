const _ = require('lodash')
const express = require('express')
const cheerio = require('cheerio')
const router = express.Router()

function getHtml(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? require('https') : require('http')
    // @ts-ignore
    const request = lib.get(url, response => {
      if (response.statusCode < 200 || response.statusCode > 299) {
        reject(new Error(`Failed to load page, status code: ${response.statusCode}`))
      }
      const body = []
      response.on('data', chunk => body.push(chunk))
      response.on('end', _ => resolve(body.join('')))
    })
    request.on('error', reject)
  })
}

async function extractItems(url, options = {}) {
  const htmlContent = await getHtml(url)
  const parsed = JSON.parse(htmlContent)
  if (parsed.items) { return parsed.items }
  return parsed
}

router.get('/', async function(req, res, next) {
  let reading
  try {
    const body = await extractItems('https://wol.jw.org/wol/bc/r30/lp-f/202018443/0/0')
    const $ = cheerio.load(body[0].content)

    const links = $('a')
    // for(let i = 0; i < links.length; i++) {
    for (let linksIndex = 0; linksIndex < 4; linksIndex++) {
      const link = links.get(linksIndex)
      console.log('link val', require('util').inspect($(link).text(), { colors: true, depth: 1 }))

      const href = `https://wol.jw.org${$(link).attr('href')}`
      const references = await extractItems(href)
      let referencesText = ''

      if (Array.isArray(references)) {
        const [researchRefs, versesRefs] = _.partition(references, ref => ref.articleClasses && ref.articleClasses.includes('scriptureIndexLink'))

        if (researchRefs) {
          for (let researchRefIndex = 0; researchRefIndex < researchRefs.length; researchRefIndex++) {
            const researchRef = researchRefs[researchRefIndex]
            const $2 = cheerio.load(researchRef.content)
            const refLinks = $2('a:not([class])') // select only researches, remove the reference to the verse originating the research
            for (let refLinkIndex = 0; refLinkIndex < refLinks.length; refLinkIndex++) {
              const refLink = refLinks.get(refLinkIndex)
              const href = `https://wol.jw.org${$(refLink).attr('href')}`
              const publications = await extractItems(href)
              publications && publications.forEach(publication => referencesText += `<br><b>${refLink.children[0].data}</b><br>${publication.content}`)
              //TODO: mettre ss une seule entrée les différentes parties d'une reference (ex: Questions des lecteurs à la suite d'un article)
              //TODO: mettre en cache recherches déjà faites et les réutiliser à l'affichage
              //TODO: formater texte et enlever liens présents ds les recherches
            }
          }
        }

        if (versesRefs) {
          versesRefs.forEach(verseRef => referencesText += `<br><b>${verseRef.title}</b><br>${verseRef.content}`)
        }
      } else { // `references` is an object containing a note
        referencesText = `<br><b>${references.title}</b><br>${references.content}`
      }

      const text = $(link).text()
      $(link).replaceWith(`<a href="#${linksIndex}" id="link${linksIndex}">${text}</a>`)
      $(`
        <p>
          <b></b><a href="#link${linksIndex}" id="${linksIndex}">${linksIndex}</a></b>
          <br>${referencesText}
        </p>
      `).appendTo('body')
    }
    reading = $.html()
  } catch (error) {
    reading = `Error in reading cut: ${error}`
  }
  res.send(reading)
})

module.exports = router