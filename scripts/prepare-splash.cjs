#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright-core')

const ROOT = path.resolve(__dirname, '..')
const DIR = path.join(ROOT, 'src/assets/splash')
const assets = [
  { name: 'background-day', maxWidth: 1672, quality: 0.82 },
  { name: 'background-night', maxWidth: 1672, quality: 0.82 },
  { name: 'title-day', maxWidth: 1536, quality: 0.9 },
  { name: 'title-night', maxWidth: 1536, quality: 0.9 },
]

async function main() {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    for (const asset of assets) {
      const source = fs.readFileSync(path.join(DIR, `${asset.name}.png`)).toString('base64')
      const encoded = await page.evaluate(async ({ source, maxWidth, quality }) => {
        const image = new Image()
        image.src = `data:image/png;base64,${source}`
        await image.decode()
        const scale = Math.min(1, maxWidth / image.naturalWidth)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(image.naturalWidth * scale)
        canvas.height = Math.round(image.naturalHeight * scale)
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
        return canvas.toDataURL('image/webp', quality).split(',')[1]
      }, { source, maxWidth: asset.maxWidth, quality: asset.quality })
      const output = path.join(DIR, `${asset.name}.webp`)
      fs.writeFileSync(output, Buffer.from(encoded, 'base64'))
      console.log(`${asset.name}.webp: ${(fs.statSync(output).size / 1024).toFixed(1)} KiB`)
    }
  } finally {
    await browser.close()
  }
}

void main()
