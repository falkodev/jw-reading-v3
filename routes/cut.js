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

function shorten(str, maxLen, separator = ' ') {
  if (str.length <= maxLen) return str;
  return str.substr(0, str.lastIndexOf(separator, maxLen));
}

async function extractItems(url, options = {}) {
  const htmlContent = await getHtml(url)
  const parsed = JSON.parse(htmlContent)
  if (parsed.items) { return parsed.items }
  return parsed
}

router.get('/', async function(req, res, next) {
  let reading
  let refGlobalCache = {}
  const domainRoot = 'https://wol.jw.org'

  try {
    const body = await extractItems('https://wol.jw.org/wol/bc/r30/lp-f/202018443/0/0')
    const $ = cheerio.load(body[0].content)

    const links = $('a')
    // for(let i = 0; i < links.length; i++) {
    for (let linksIndex = 0; linksIndex < 4; linksIndex++) {
      const link = links.get(linksIndex)
      // console.log('link val', require('util').inspect($(link).text(), { colors: true, depth: 1 }))

      const href = `${domainRoot}${ $(link).attr('href') }`
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
              let refVerseCache = {}
              let publications
              const refLink = refLinks.get(refLinkIndex)
              const refLinkTitle = refLink.children[0].data.trim().replace(/[,;]$/, '').trim()
              const href = `${domainRoot}${ $(refLink).attr('href') }`
              const naturalHref = `${domainRoot}/fr${ $(refLink).attr('href') }`
              const indexInGlobalCache = Object.keys(refGlobalCache).some(entry => entry === refLinkTitle)
              if (indexInGlobalCache) {
                publications = refGlobalCache[refLinkTitle] 
              } else {
                publications = await extractItems(href)
                refGlobalCache[refLinkTitle] = publications
              }

              publications && publications.forEach(publication => {
                let displayRefTitle = true
                let content = publication.content
                const indexInVerseCache = Object.keys(refVerseCache).some(entry => entry === refLinkTitle)

                if (indexInVerseCache) {
                  refVerseCache[refLinkTitle] += content
                  displayRefTitle = false
                } else {
                  refVerseCache[refLinkTitle] = content
                }
                
                if (content.length > 1000) {
                  content = `${shorten(content, 800)} <a class="link" href=${naturalHref} target="_blank">...</a><br>`
                }
                referencesText += displayRefTitle
                  ? `<br><b>${refLink.children[0].data}</b>&nbsp;<a class="link" href=${naturalHref} target="_blank">External</a><br>${content}`
                  : `${content}`
              })
              //TODO: ajouter node-config
              //TODO: icone pour lien externe
            }
          }
        }

        if (versesRefs) {
          versesRefs.forEach(verseRef => referencesText += `<br><b>${verseRef.title}</b><br>${verseRef.content}`)
        }
      } else { // `references` is an object containing a note
        referencesText = `<br><b>${references.title}</b><br>${references.content}`
      }

      const $3 = cheerio.load(referencesText)
      $3('a').not('.link').each(function () {
        $(this).attr('href', '')
        const span = $(`<span>${ $(this).html() }</span>`)
        $(this).replaceWith(span)
      })

      const text = $(link).text()
      const classes = $(link).attr('class')
      $(link).replaceWith(`<a href="#${linksIndex}" id="link${linksIndex}" class="${classes}">${text}</a>`)
      $('body').append(`
        <p>
          <b></b><a href="#link${linksIndex}" id="${linksIndex}">${classes.includes('cl') ? 'Chapitre '+text : text}</a></b>
          <br>${ $3.html() }
        </p>
      `)
    }
    $('body').attr('style', 'color:#505D6E;font-family:Helvetica, Arial, sans-serif;font-weight:normal;font-size:16px;')
    $('body').prepend('<p style="background:#505D6E;padding:20px;padding-bottom:30px;color:#FFFFFF;"><a href="http://www.jwreading.com" style="color: #FFFFFF;text-decoration:none"><img src="http://www.jwreading.com/assets/images/book.png" style="width: 32px; height: 32px;"/>&nbsp;&nbsp;&nbsp;&nbsp;JW Reading</a></p>')
    $('.cl').each((index, chapterVerse) => {
      const text = $(chapterVerse).text()
      $(chapterVerse).text(`Chapitre ${text}`)
    })
    reading = $.html()
  } catch (error) {
    reading = `Error in reading cut: ${error}`
  }
  res.send(reading)
})

module.exports = router
