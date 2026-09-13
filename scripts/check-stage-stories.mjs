import assert from 'node:assert/strict'
import {chromium} from 'playwright-core'
const base=process.argv[2]??'http://127.0.0.1:5177'
const browser=await chromium.launch()
try {for(const touch of [false,true]){
 const page=await browser.newPage({viewport:touch?{width:390,height:780}:{width:1440,height:900},hasTouch:touch})
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort())
 await page.route('**/src/hooks/useGameEngine.ts*',async r=>{const response=await r.fetch();await r.fulfill({response,body:(await response.text()).replace('instance.onStateChange(store.update);','instance.onStateChange(store.update); window.__story = {engine:instance,store};')})})
 await page.goto(base)
 await page.evaluate(async()=>{
   const {updateDisplaySettings}=await import('/src/game/renderer/displayPrefs.ts')
   updateDisplaySettings({soloTutorial:'disabled'})
   window.__earlyStart=false
   const observer=new MutationObserver(()=>{if(document.querySelector('[data-solo-start]'))window.__earlyStart=true})
   observer.observe(document.body,{childList:true,subtree:true});window.__startObserver=observer
 })
 await page.getByRole('button',{name:'혼자 하기',exact:true}).click()
 await page.waitForFunction(()=>window.__story)
 await page.waitForSelector('[data-game-screen]')
 await page.getByRole('dialog').waitFor()
 assert.equal(await page.evaluate(()=>{window.__startObserver.disconnect();return window.__earlyStart}),false)
 for(const stage of [1,2,3,4,5]){
  if(stage>1)await page.evaluate(id=>{window.__story.engine.enterStage(id);window.__story.engine.emit()},stage)
  const dialog=page.getByRole('dialog');await dialog.waitFor({timeout:5000}).catch(async e=>{console.log({stage,touch,errors,snapshot:await page.evaluate(()=>({phase:window.__story.store.getSnapshot().phase,stage:window.__story.store.getSnapshot().stage,body:document.body.innerText.slice(0,800)}))});throw e})
  const before=await page.evaluate(()=>window.__story.store.getSnapshot().stats.durationSec)
  await page.waitForTimeout(350)
  assert.equal(await page.evaluate(()=>window.__story.store.getSnapshot().stats.durationSec),before)
  assert(await dialog.locator('button').evaluateAll(es=>es.every(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth})))
  if(stage===1)await page.screenshot({path:`/tmp/stage-arrival-${touch?'mobile':'pc'}.png`})
  if(stage===1&&touch) {
    await page.setViewportSize({width:320,height:240})
    assert(await dialog.locator('button').evaluateAll(es=>es.every(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})))
    await page.setViewportSize({width:390,height:780})
  }
  if(stage===1) {
    await dialog.getByRole('button',{name:/다음 이야기/}).waitFor()
  } else {
    await dialog.getByRole('button',{name:/이야기 보기/}).click()
  }
  if(stage===1&&touch){
    await page.setViewportSize({width:320,height:240})
    assert(await dialog.locator('button').evaluateAll(es=>es.every(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth})))
    await page.setViewportSize({width:390,height:780})
  }
  if(stage===1)await page.screenshot({path:`/tmp/stage-story-${touch?'mobile':'pc'}.png`})
  if(stage===2){if(touch)await dialog.getByRole('button',{name:'건너뛰기',exact:true}).click();else await page.keyboard.press('Escape')}
  else {if(touch)await dialog.getByRole('button',{name:/다음 이야기/}).click();else {await dialog.getByRole('button',{name:/다음 이야기/}).focus();await page.keyboard.press('Enter')}await dialog.getByRole('button',{name:/다음 이야기/}).click();await dialog.getByRole('button',{name:/정리 시작/}).click()}
  await page.locator('[data-solo-start="ready"]').waitFor()
  const countdownTime = await page.evaluate(()=>window.__story.store.getSnapshot().stats.durationSec)
  await page.locator('[data-solo-start="start"]').waitFor()
  assert.equal(await page.evaluate(()=>window.__story.store.getSnapshot().stats.durationSec),countdownTime)
  assert.equal(await page.evaluate(()=>window.__story.store.getSnapshot().stage.storyOpen),true)
  if(touch) await page.getByRole('button',{name:'입력하고 시작',exact:true}).click()
  await page.waitForFunction(()=>window.__story.store.getSnapshot().phase==='playing')
  assert.equal(await page.evaluate(()=>window.__story.store.getSnapshot().stage.storyOpen),false)
  assert.equal(await page.locator('input[aria-label="단어 입력"]').evaluate(e=>e===document.activeElement),true)
 }
 await page.emulateMedia({reducedMotion:'reduce'})
 await page.evaluate(()=>{window.__story.engine.enterStage(1);window.__story.engine.emit()})
 await page.getByRole('button',{name:/다음 이야기/}).waitFor({timeout:1000})
 assert.equal(await page.locator('.stage-story-sheet').evaluate(e=>getComputedStyle(e).animationName),'none')
 assert.deepEqual(errors,[]);console.log(`PASS ${touch?'mobile':'PC'} five stage stories, freeze, skip, input focus`)
 await page.close()
}}finally{await browser.close()}
