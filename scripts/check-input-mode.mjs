import assert from 'node:assert/strict'
import {chromium} from 'playwright-core'
const base=process.argv[2]??'http://127.0.0.1:5175'
const browser=await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? chromium.executablePath() })
try {
  for (const scenario of [
    {name:'narrow PC',width:1000,touch:false,mode:'auto',expected:'pc'},
    {name:'PC at full layout boundary',width:800,touch:false,mode:'auto',expected:'pc'},
    {name:'PC below layout boundary',width:799,touch:false,mode:'auto',expected:'pc'},
    {name:'wide touch',width:1440,touch:true,mode:'auto',expected:'mobile'},
    {name:'touch with mouse',width:1000,touch:true,hybrid:true,mode:'auto',expected:'pc'},
    {name:'manual PC on touch',width:390,touch:true,mode:'pc',expected:'pc'},
    {name:'manual mobile on PC',width:1000,touch:false,mode:'mobile',expected:'mobile'},
  ]) {
    const page=await browser.newPage({viewport:{width:scenario.width,height:780},hasTouch:scenario.touch})
    const errors=[];page.on('pageerror',error=>errors.push(error.message))
    await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort())
    await page.addInitScript(({mode,hybrid})=>{
      localStorage.setItem('typing-stacker/display/v1',JSON.stringify({inputMode:mode,soloTutorial:'required'}))
      if(hybrid){const original=window.matchMedia.bind(window);window.matchMedia=query=>{const media=original(query);if(query==='(any-pointer: fine) and (any-hover: hover)')Object.defineProperty(media,'matches',{value:true});return media}}
    },scenario)
    await page.goto(base)
    await page.getByRole('button',{name:'혼자 하기',exact:true}).click()
    const full=scenario.expected==='pc' && scenario.width>=800
    const game=full?'[data-game-layout="desktop"]':`.mp-game[data-controls="${scenario.expected}"]`
    await page.locator(game).waitFor()
    if(scenario.expected==='pc') {
      await page.waitForFunction(selector=>document.querySelector(selector)?.getAttribute('data-phase')==='playing',game)
      const input=page.getByRole('textbox',{name:'단어 입력'})
      assert(await input.evaluate(e=>e===document.activeElement))
      assert.equal(await page.locator('[data-tutorial-next]').count(),0)
      await page.waitForTimeout(250)
      await input.press('Enter')
      await page.waitForFunction(()=>document.body.textContent.includes('책을 입력하고 Enter를 누르세요. 움직이는 화살표 위치에 물건이 떨어집니다.'))
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth), 'No horizontal page overflow')
      const field=await input.boundingBox()
      assert(field.x>=0 && field.x+field.width<=scenario.width, 'Input fits viewport')
      if(full) {
        const lanes=await page.locator('[data-aim]').evaluate(e=>[...e.parentElement.children].map(c=>{const r=c.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width}}))
        assert(lanes.every(r=>r.left>=0 && r.right<=scenario.width && r.width>0), 'Both word lanes and arena fit')
      }
      await input.press('Escape')
      await page.locator('[data-pause]').waitFor()
      await page.keyboard.press('Escape')
      await page.waitForFunction(selector=>document.querySelector(selector)?.getAttribute('data-phase')==='playing',game)
    } else await page.getByPlaceholder('눌러서 시작').waitFor()
    assert.deepEqual(errors,[])
    console.log(`PASS ${scenario.name}`)
    await page.close()
  }
  const page=await browser.newPage({viewport:{width:1000,height:780}})
  await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort())
  await page.goto(base)
  await page.getByRole('button',{name:'옵션',exact:true}).click()
  await page.getByRole('button',{name:'조작 방식 · 자동',exact:true}).click()
  await page.getByRole('button',{name:'조작 방식 · PC',exact:true}).click()
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('typing-stacker/display/v1')).inputMode),'mobile')
  await page.reload()
  await page.getByRole('button',{name:'옵션',exact:true}).click()
  await page.getByRole('button',{name:'조작 방식 · 모바일',exact:true}).waitFor()
  console.log('PASS settings selection persists after reload')
} finally {await browser.close()}
