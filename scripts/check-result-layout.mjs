// Run against a local Vite server: node scripts/check-result-layout.mjs [base URL]
// Network responses are replaced only in this isolated browser; no scores are submitted.
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
const base = process.argv[2] ?? 'http://127.0.0.1:5175'
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? chromium.executablePath() })
try {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort())
  await page.route('**/src/hooks/useRunRanking.ts*', route => route.fulfill({contentType:'application/javascript', body: `export function useRunRanking() { return {status:'offline', view:null, isBest:false, retry() {}} }`}))
  await page.route('**/src/main.tsx*', async route => {
    const response = await route.fetch()
    const original = await response.text()
    const reactPath = original.match(/from "([^"]*\/react\.js[^"]*)"/)[1]
    const body = original.replace(/import \{ Root \} from "[^"]+";/, `
      import ReactFixture from ${JSON.stringify(reactPath)};
      import {ResultScreen} from '/src/screens/ResultScreen.tsx';
      import {ALL_VARIANTS} from '/src/game/data/words.ts';
      function Root() {
        const tutorial = new URLSearchParams(location.search).has('tutorial');
        const act = value => () => { document.body.dataset.resultAction = value };
        return ReactFixture.createElement('main', {style:{position:'fixed',inset:0}},
          ReactFixture.createElement(ResultScreen, {
            stats:{score:12345678,rawScore:15000000,accuracy:.82,stackCount:128,maxHeight:8.2,missedWords:Number(new URLSearchParams(location.search).get('misses') ?? 23),lives:0,combo:0,maxCombo:32,kpm:280,durationSec:180,hiddenFound:[]},
            freshlyCollected:ALL_VARIANTS.slice(0,4).map(item=>item.id),totalReturns:Number(new URLSearchParams(location.search).get('returns') ?? 0),
            congestionDemo:tutorial,onStartGame:act('start'),onReplayTutorial:act('tutorial'),onRestart:act('restart'),onHome:act('home')
          }));
      }
    `)
    await route.fulfill({response,body})
  })
  for (const tutorial of [false,true]) {
    await page.goto(`${base}/${tutorial?'?tutorial=1':''}`)
    for (const size of [{width:360,height:568},{width:390,height:780},{width:390,height:320},{width:320,height:240},{width:1440,height:900}]) {
      await page.setViewportSize(size)
      const actions = tutorial ? ['게임 시작하기','튜토리얼 다시 보기'] : ['다시 하기','처음으로']
      await page.getByRole('button',{name:actions[0],exact:true}).waitFor()
      await page.evaluate(()=>document.fonts.ready)
      for (const name of actions) {
        const button=page.getByRole('button',{name,exact:true})
        const rect=await button.boundingBox()
        assert(rect && rect.x>=0 && rect.y>=0 && rect.x+rect.width<=size.width+.5 && rect.y+rect.height<=size.height+.5, `${tutorial?'tutorial':'result'} ${size.width}x${size.height}: ${name} outside viewport ${JSON.stringify(rect)}`)
        await button.click()
        assert(await page.locator('body').getAttribute('data-result-action'))
      }
      const content = page.locator('.result-content')
      assert.equal(await content.count(), 1)
      await content.evaluate(element => { element.scrollTop = element.scrollHeight })
      await page.keyboard.press('ArrowUp')
      await page.keyboard.press('Enter')
      assert.equal(await page.locator('body').getAttribute('data-result-action'), tutorial ? 'start' : 'restart')
      console.log(`PASS ${tutorial?'tutorial':'result'} ${size.width}x${size.height}`)
    }
  }
  for(const [returns,misses,hint] of [[0,23,'이름을 입력해 회수'],[7,23,'경보를 최대 15'],[7,0,'자리를 만들어']]){
    await page.setViewportSize({width:390,height:780})
    await page.goto(`${base}/?returns=${returns}&misses=${misses}`)
    const tip=page.getByRole('region',{name:'다음 판 안내'})
    await tip.waitFor()
    assert((await tip.innerText()).includes(hint))
    assert(await page.getByText('회수한 물건',{exact:true}).count())
    await tip.scrollIntoViewIfNeeded()
    await page.screenshot({path:`/tmp/result-guidance-${returns}-${misses}.png`})
    console.log(`PASS result guidance returns=${returns}, misses=${misses}`)
  }
  assert.deepEqual(errors,[])
} finally {await browser.close()}
