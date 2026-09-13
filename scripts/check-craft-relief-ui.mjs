import assert from 'node:assert/strict'
import {chromium} from 'playwright-core'
const base=process.argv[2]??'http://127.0.0.1:5176'
const browser=await chromium.launch()
try {
 for(const width of [320,390,800,1440]){
  const page=await browser.newPage({viewport:{width,height:780}})
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort())
  await page.route('**/src/screens/GameScreen.tsx*',async r=>{const response=await r.fetch();await r.fulfill({response,body:(await response.text())+'\nexport {StageStatus};'})})
  await page.route('**/src/main.tsx*',async r=>{
   const response=await r.fetch(),original=await response.text()
   const reactPath=original.match(/from "([^"]*\/react\.js[^"]*)"/)[1]
   const body=original.replace(/import \{ Root \} from "[^"]+";/,`
    import R from ${JSON.stringify(reactPath)};
    import {StageStatus} from '/src/screens/GameScreen.tsx';
    import {MobileCongestion} from '/src/screens/MobileGameInfo.tsx';
    import '/src/screens/MobileGameScreen.css';
    import {GameEngine} from '/src/game/core/GameEngine.ts';
    const engine=await GameEngine.create(93);let snapshot;engine.onStateChange(s=>snapshot=s);engine.startRun(false);engine.pause();engine.dispose();
    const stage={...snapshot.stage,congestion:25,congestionRecovery:{amount:15,combo:false,crafted:true},congestionRecoverySeq:1};
    function Root(){return R.createElement('div',{style:{position:'fixed',inset:0,paddingTop:120,background:'#303a36'}},
      innerWidth<800 ? R.createElement('header',{className:'mp-hud'},R.createElement(MobileCongestion,{value:25,rushing:false,recovery:stage.congestionRecovery,recoverySeq:1}))
      : R.createElement(StageStatus,{stage,missSeq:0,congestionRecoverySeq:1}));}
   `)
   await r.fulfill({response,body})
  })
  await page.goto(base)
  const badge=page.locator('[data-craft-recovery="15"]')
  await badge.waitFor()
  assert.equal(await badge.innerText(),'합성 정리 −15')
  const box=await badge.boundingBox()
  assert(box&&box.x>=0&&box.x+box.width<=width&&box.y>=0&&box.y+box.height<=780)
  await page.screenshot({path:`/tmp/craft-relief-${width}.png`})
  await page.waitForTimeout(2200)
  assert.equal(await badge.evaluate(e=>getComputedStyle(e).opacity),'0')
  assert.deepEqual(errors,[])
  console.log(`PASS ${width}px craft recovery fits and fades`)
  await page.close()
 }
}finally{await browser.close()}
