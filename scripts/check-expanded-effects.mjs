import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
const output='artifacts/three-prototype'
const errors=[], samples=[]
try {
const page=await browser.newPage({viewport:{width:1440,height:1000}})
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
await page.goto('http://127.0.0.1:5183/?three-prototype=1');await page.waitForSelector('[data-ready="true"]')
await page.getByLabel('물건 분류').selectOption('all')
assert.equal(await page.locator('.three-drop-items button').count(),185)
await page.locator('[data-renderer]').evaluate(e=>{window.testCanvas=e})
for(const [id,shape] of [['sunflower','petal'],['magic-wand','star'],['laptop','puff'],['bubble-bottle','bubble']]) {
 await page.getByRole('button',{name:'상자 비우기',exact:true}).click()
 const resume=page.getByRole('button',{name:'낙하 계속',exact:true});if(await resume.count())await resume.click()
 await page.getByLabel('물건 검색').fill(id)
 await page.locator(`[data-item-id="${id}"]`).click()
 await page.waitForFunction(()=>Number(document.querySelector('[data-renderer]').dataset.jelly)>0.0001)
 await page.waitForTimeout(80)
 await page.getByRole('button',{name:'낙하 멈춤',exact:true}).click()
 const data=await page.locator('[data-renderer]').evaluate(e=>({...e.dataset}))
 assert.equal(data.particleKinds,shape)
 samples.push({id,...data})
 await page.screenshot({path:`${output}/expanded-${id}.png`})
}
assert(await page.evaluate(()=>window.testCanvas===document.querySelector('[data-renderer]')))
await page.getByRole('button',{name:'회수 이펙트',exact:true}).click();await page.waitForTimeout(900)
await page.screenshot({path:`${output}/expanded-recall.png`})
await page.getByLabel('물건 검색').fill('없는물건xx')
assert(await page.getByRole('button',{name:'목록 0종 낙하',exact:true}).isDisabled())
await page.getByLabel('물건 분류').selectOption('magic')
await page.getByRole('button',{name:'목록 6종 낙하',exact:true}).click()
assert.equal(await page.locator('[data-renderer]').getAttribute('data-bodies'),'6')
await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300)
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
await page.screenshot({path:`${output}/expanded-mobile.png`,fullPage:true})
assert.deepEqual(errors,[])
await writeFile(`${output}/expanded-checks.json`, JSON.stringify({samples,errors},null,2))
console.log(JSON.stringify({samples,errors},null,2))
} finally {await browser.close()}
