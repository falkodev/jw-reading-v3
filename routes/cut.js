const fs = require('fs')
const _ = require('lodash')
const config = require('config')
const moment = require('moment')
const express = require('express')
const cheerio = require('cheerio')
const { promisify } = require('util')
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

router.get('/:lang', async function(req, res, next) {
  req.setTimeout(5 * 60 * 1000);
  res.setTimeout(5 * 60 * 1000);

  let reading
  const lang = req.params.lang
  const langPath = config.get(`${lang}.langPath`)
  const yearWeek = moment().add(7, 'days').format('WW')
  const writeFileAsync = promisify(fs.writeFile)

  try {
    let contents = ''
    let refGlobalCache = {}
    const domainRoot = 'https://wol.jw.org'
    const langUrl = config.get(`${lang}.langUrl`)
    const date = moment().add(7, 'days').format('YYYY/MM/DD')
    const url = await extractItems(`${domainRoot}/wol/dt/${langUrl}/${date}`)
    const $ = cheerio.load(url[1].content)
    const readingPortion = $('header > h2 > a.b').text()
    const langPortionHeader = config.get(`${lang}.langPortionHeader`)
    const langReadingSentence = config.get(`${lang}.langReadingSentence`)
    const langChapter = config.get(`${lang}.langChapter`)
    const langResearchesTitle = config.get(`${lang}.langResearchesTitle`)
    const readingUrls = $('header > h2 > a.b')
    for (let i = 0; i < readingUrls.length; i++) {
      const readingUrl = $(readingUrls[i]).attr('href')
      const body = await extractItems(`${domainRoot}${readingUrl}`)
      contents += body[0].content
    }
    const $1 = cheerio.load(contents)

    $1('p.sb').last().append(`<br><br><br><div class="research-title"><b>${langResearchesTitle}</b></div><br>`)

    const links = $1('a')
    for (let linksIndex = 0; linksIndex < links.length; linksIndex++) {
    // for (let linksIndex = 0; linksIndex < 1; linksIndex++) {
      console.log('progress:', require('util').inspect(`${(linksIndex + 1)} / ${links.length}`, { colors: true, depth: 0 }))
      const link = links.get(linksIndex)

      const href = `${domainRoot}${ $1(link).attr('href') }`
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
              const href = `${domainRoot}${ $2(refLink).attr('href') }`
              const naturalHref = `${domainRoot}/${lang}${ $2(refLink).attr('href') }`
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
                //TODO: changer icone en blanc
                //TODO: formater texte
                if (content.length > 1000) {
                  content = `${shorten(content, 800)} <a class="link" href=${naturalHref} target="_blank">...<img src="http://jwreading.com/img/external-link.png" style="width: 16px;height: 16px;position: relative;top: -1px;left: 5px;"/></a><br>`
                }
                referencesText += displayRefTitle
                  ? `<br><b>${refLinkTitle}</b>&nbsp;<a class="link" href=${naturalHref} target="_blank">jw.org<img src="http://jwreading.com/img/external-link.png" style="width: 16px;height: 16px;position: relative;top: -1px;left: 5px;"/></a><br>${content}`
                  : `${content}`
              })
            }
          }
        }

        if (versesRefs) {
          versesRefs.forEach(verseRef => referencesText += `<br><b>${verseRef.title}</b><br>${verseRef.content.replace(/ class="v"/gm, '')}`)
        }
      } else { // `references` is an object containing a note
        referencesText = `<br><b>${references.title}</b><br>${references.content}`
      }

      const $3 = cheerio.load(referencesText)
      $3('a').not('.link').each(function () {
        // remove link to other verses in researches
        $3(this).attr('href', '')
        const span = $3(`<span>${ $3(this).html() }</span>`)
        $3(this).replaceWith(span)
      })
      $3('h1').attr('style', 'font-size: 16px')
      $3('h2').attr('style', 'font-size: 16px')
      $3('h3').attr('style', 'font-size: 16px')

      // pictures in research
      const src = $3('figure').children('img').data('img-small-src')
      if (src) {
        $3('figure').children('img').attr('src', `${domainRoot}${src}`)
        $3('figure').children('img').attr('style', 'width: unset; height: unset;')
        $3('figure').attr('style', 'margin-inline-start: 5px;')
      }

      const text = $1(link).text()
      const classes = $1(link).attr('class')
      $1(link).replaceWith(`<a href="#${linksIndex}" id="link${linksIndex}" class="${classes}">${text}</a>`)
      $1('body').append(`
        <p>
          <b></b><a href="#link${linksIndex}" id="${linksIndex}" class="research">${classes.includes('cl') ? langChapter+' '+text : text}</a></b>
          <br>${ $3.html() }
        </p>
      `)
    }

    $1('body').attr('style', 'color:#505D6E;font-family:Helvetica, Arial, sans-serif;font-weight:normal;font-size:16px;')
    $1('body').prepend(`<br><p></p><b><span id="weeklyPortion">${langReadingSentence}&nbsp;${readingPortion}.</span></b></p><br>`)
    $1('body').prepend(`<p style="background:#505D6E;padding:20px;padding-bottom:30px;color:#FFFFFF;"><a href="http://www.jwreading.com" style="color: #FFFFFF;text-decoration:none"><img src="http://www.jwreading.com/assets/images/book.png" style="width: 32px; height: 32px;position: relative; top: 10px; left: 3px;"/>&nbsp;&nbsp;&nbsp;&nbsp;JW Reading - ${langPortionHeader}</a></p>`)

    // add "Chapter" to each verse 1 of chapters
    $1('.cl').each((index, chapterVerse) => {
      const text = $1(chapterVerse).text()
      $1(chapterVerse).text(`${langChapter} ${text}`)
    })

    const newBody = $1('body').clone()
    const header = $1('body').children().first()
    $1(newBody).children().first().remove()
    $1('body').empty()
    $1('body').append(header)
    $1('body').append('<div class="dailyrun"></div>')
    $1('.dailyrun').append(newBody)
    reading = $1.html()
    await writeFileAsync(`public/portions/${langPath}/${yearWeek}dbr11.html`, reading)
  } catch (error) {
    reading = `Error in reading cut: ${error}`
  }

  res.send(reading)
})

module.exports = router
