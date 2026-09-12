import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { writeFile } from 'node:fs/promises'
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
const results=[],errors=[]
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}})
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
 await page.goto('http://127.0.0.1:5183/?three-prototype=1');await page.waitForSelector('[data-ready="true"]')
 assert.equal(await page.getByLabel('물건 분류').locator('option').count(),21)
 for(const [category,id,shape] of [['grains','rice-plant','chip'],['lights','candle','puff'],['sound','speaker','puff'],['gas','fart-cloud','steam'],['soil','cactus','puff'],['propulsion','spaceship-saucer','puff'],['reflection','crystal','spark']]){
  await page.getByRole('button',{name:'상자 비우기',exact:true}).click()
  const resume=page.getByRole('button',{name:'낙하 계속',exact:true});if(await resume.count())await resume.click()
  await page.getByLabel('물건 분류').selectOption(category)
  await page.locator(`[data-item-id="${id}"]`).click()
  await page.waitForFunction(()=>Number(document.querySelector('[data-renderer]').dataset.jelly)>0.0001,null,{timeout:10000})
  await page.waitForTimeout(30);await page.getByRole('button',{name:'낙하 멈춤',exact:true}).click()
  const data=await page.locator('[data-renderer]').evaluate(e=>({...e.dataset}))
  assert.equal(data.particleKinds,shape,id)
  await page.screenshot({path:`artifacts/three-prototype/schema-${category}.png`})
  results.push({category,id,...data})
 }
 const recall=page.getByRole('button',{name:'회수 이펙트',exact:true})
 await recall.click();await page.waitForTimeout(900);await page.screenshot({path:'artifacts/three-prototype/schema-recall.png'})
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150)
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
 assert.deepEqual(errors,[])
 await writeFile('artifacts/three-prototype/schema-browser-checks.json',JSON.stringify({results,errors},null,2))
 console.log(JSON.stringify({results,errors},null,2))
}finally{await browser.close()}
