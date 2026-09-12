/** Run against the isolated dev server. Exercises DOM input, not an OS Korean IME. */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'

const url = process.env.THREE_PROTOTYPE_URL ?? 'http://127.0.0.1:5183/?three-prototype=1'
const output = 'artifacts/three-prototype'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'],
})
const errors = [], remote = [], report = {}
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('request', (request) => { if (!request.url().startsWith(new URL(url).origin) && /^https?:/.test(request.url())) remote.push(request.url()) })
  await page.goto(url)
  await page.waitForSelector('canvas[data-ready="true"]')
  await page.waitForTimeout(400)
  assert.equal(await page.getByRole('alert').count(), 0)
  const resources = () => page.locator('[data-renderer]').evaluate((canvas) => ({ ...canvas.dataset }))
  report.gallery = await resources()
  await page.screenshot({ path: `${output}/gallery-flat.png` })
  await page.locator('summary').click()
  await page.getByLabel('옆면 보기 8°').check()
  await page.screenshot({ path: `${output}/gallery-angled.png` })
  await page.getByLabel('옆면 보기 8°').uncheck()
  // Repeated remounts must restore the same resource counts and keep a usable context.
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: '기존 2D', exact: true }).click()
    await page.getByRole('button', { name: '두꺼운 스티커', exact: true }).click()
    await page.getByRole('button', { name: '2D 물건 + 3D 상자', exact: true }).click()
  }
  const after = await resources()
  assert.equal(after.geometries, report.gallery.geometries)
  assert.equal(after.textures, report.gallery.textures)
  report.afterSwitches = after
  await page.locator('summary').click()
  await page.getByRole('button', { name: '6종 모두 떨어뜨리기', exact: true }).click()
  await page.waitForFunction(() => Number(document.querySelector('[data-renderer]').dataset.particles) > 0)
  report.impact = await resources()
  await page.screenshot({ path: `${output}/effect-impact.png` })
  await page.getByRole('button', { name: '비교 배치로 복원', exact: true }).click()
  await page.getByRole('button', { name: '합성 이펙트', exact: true }).click()
  await page.waitForTimeout(1600)
  await page.screenshot({ path: `${output}/effect-merge.png` })
  await page.getByRole('button', { name: '회수 이펙트', exact: true }).click()
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${output}/effect-recall.png` })
  await page.getByRole('button', { name: '튜토리얼 플레이', exact: true }).click()
  await page.waitForTimeout(1600)
  const input = page.getByRole('textbox', { name: '단어 입력', exact: true })
  const submit = async (text) => { if (text === '') await page.waitForTimeout(220); await input.fill(text); await input.press('Enter'); await page.waitForTimeout(450) }
  const state = () => page.evaluate(() => window.__stacker3d.getState())
  await submit('')
  assert.equal((await state()).stage.tutorialStep, 1)
  await submit('책')
  assert.equal(Number((await resources()).bodies), 1, 'one Enter should drop exactly one item')
  assert.equal((await state()).stage.tutorialStep, 2)
  for (let i = 0; i < 3; i++) await submit('계란')
  // The existing tutorial assists the first merge after three pans if necessary.
  for (let i = 0; i < 3 && (await state()).stage.tutorialStep === 3; i++) await submit('프라이팬')
  await page.waitForFunction(() => window.__stacker3d.getState().stage.tutorialStep >= 4, null, { timeout: 20000 })
  report.afterMerge = (await state()).stage
  await page.screenshot({ path: `${output}/tutorial-merge.png` })
  while ((await state()).stage.tutorialStep < 7) await submit('')
  await submit('계란 프라이')
  assert.equal((await state()).stage.totalReturns, 1)
  report.afterRecall = (await state()).stage
  await page.screenshot({ path: `${output}/tutorial-recall.png` })
  // Pause and switch an actual populated world without changing the game state.
  await page.evaluate(() => window.__stacker3d.engine.pause())
  const before = await state()
  await page.locator('summary').click()
  await page.getByRole('button', { name: '기존 2D', exact: true }).click()
  await page.getByRole('button', { name: '2D 물건 + 3D 상자', exact: true }).click()
  assert.deepEqual(await state(), before)
  await page.locator('summary').click()
  await page.evaluate(() => window.__stacker3d.engine.resume())
  // Follow the existing congestion tutorial through the 100-item stress sequence.
  for (let i = 0; i < 2; i++) await submit('')
  await page.waitForFunction(() => window.__stacker3d.getState().stage.congestionDemo === 'full', null, { timeout: 20000 })
  await submit('')
  report.stress = await page.evaluate(async () => {
    const frames = [], counts = []
    let previous = performance.now()
    const start = previous
    await new Promise((resolve) => {
      function frame(now) {
        frames.push(now - previous); previous = now
        counts.push(Number(document.querySelector('[data-renderer]').dataset.bodies))
        if (now - start < 7000) requestAnimationFrame(frame)
        else resolve()
      }
      requestAnimationFrame(frame)
    })
    frames.sort((a, b) => a - b)
    return { maxVisibleBodies: Math.max(...counts), medianFrameMs: frames[Math.floor(frames.length / 2)], p95FrameMs: frames[Math.floor(frames.length * 0.95)], frames: frames.length }
  })
  await page.waitForFunction(() => window.__stacker3d.getState().stage.congestionDemo === 'gameOverPrompt', null, { timeout: 20000 })
  await submit('')
  assert.equal((await state()).phase, 'over')
  await page.getByRole('button', { name: '같은 시드로 다시 하기', exact: true }).click()
  assert.equal((await state()).stage.tutorialStep, 0)
  assert.equal((await state()).stats.stackCount, 0)
  assert.equal(await page.getByRole('alert').count(), 0)
  assert.deepEqual(remote, [], 'prototype must not contact ranking services')
  assert.deepEqual(errors, [])
  report.errors = errors
  report.remoteRequests = remote
  await writeFile(`${output}/checks.json`, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
} finally { await browser.close() }
