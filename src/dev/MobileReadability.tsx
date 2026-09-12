import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ArenaRenderer, ARENA_ART_SOURCES } from '../game/renderer/ArenaRenderer.ts'
import { preloadSprites } from '../game/renderer/spriteCache.ts'
import { ARENA, ARENA_SCREEN_MAX_WIDTH } from '../game/config.ts'
import { WORDS, VARIANT_BY_ID } from '../game/data/words.ts'
import type { BodySnapshot, FallingWord } from '../game/types/game.ts'
import { TypingLane } from '../components/TypingLane.tsx'
import { ArenaBackdrop } from '../components/ArenaBackdrop.tsx'
import './MobileReadability.css'
import { compactCamera } from '../game/renderer/compactCamera.ts'
import { MobileCongestion, MobileMergeToast, MobileWhiteboard } from '../screens/MobileGameInfo.tsx'
import '../screens/MobileGameScreen.css'
import { RECIPES } from '../game/data/recipes.ts'

const LONG_RECIPE = [...RECIPES].sort((a, b) => b.result.label.length - a.result.label.length)[0]!

// Fixed visual fixtures, not a simulation of physics or mobile IME behavior.
const BODIES: readonly BodySnapshot[] = [
  ['laptop', -0.65, 1.04], ['egg', 0.38, 1.12], ['clover', 0.98, 1.16],
  ['egg', -0.2, 1.42], ['clover', 0.6, 1.55], ['laptop', -0.58, 1.83],
].map(([id, x, y], handle) => {
  const variant = VARIANT_BY_ID.get(String(id))
  if (variant === undefined) throw new Error(`Missing fixture: ${id}`)
  return { handle, variant, owner: 'preview', x: Number(x), y: Number(y), rotation: 0, settled: true }
})
const LABELS = ['크리스마스트리', '프라이팬', '계란', '클로버', '노트북', '우산', '책', '피자', '나뭇잎', '도시락']
const FIXTURE_WORDS: readonly FallingWord[] = LABELS.map((word, id) => ({
  id, word, side: id % 2 === 0 ? 'left' : 'right', slot: Math.floor(id / 2),
  y: 0.12 + (id % 5) * 0.18, state: 'active', fade: 1,
}))
const PRESETS = { compact: [360, 740], standard: [390, 844], large: [430, 932] } as const
type Metrics = { width: number; height: number; scale: number }

function SceneCanvas({ onMetrics, night, moving, compact }: {
  onMetrics: (metrics: Metrics) => void; night: boolean; moving: boolean; compact: boolean
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (canvas === null) return
    const renderer = new ArenaRenderer(canvas, compact)
    let disposed = false
    let frame = 0
    const draw = (time = 0) => {
      renderer.draw({
        bodies: BODIES, aimX: moving ? Math.sin(time / 1800) : 0.35, showAim: true,
        landing: null, ownerColors: null, cameraY: 0, stackTop: 2.1,
        time: time / 1000, impacts: [], nightfall: night ? 1 : 0,
        pairMarks: new Map([['egg', 1]]), pairPulse: 1,
      })
    }
    const resize = () => {
      renderer.resize()
      const { width, height } = canvas.getBoundingClientRect()
      // Matches ArenaRenderer.resize(); this is the CSS size, not backing pixels.
      const worldHeight = Math.max(ARENA.height, ARENA.spawnY + 0.8) - ARENA.killY - 0.18
      const scale = compact ? compactCamera(width, height, 2.1).scale : Math.min(Math.min(width, ARENA_SCREEN_MAX_WIDTH) / (ARENA.halfWidth * 2), height / worldHeight)
      canvas.dataset.scale = String(scale)
      onMetrics({ width, height, scale })
      draw()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()
    void preloadSprites([...ARENA_ART_SOURCES, ...BODIES.map((body) => body.variant.sprite)]).then(() => {
      if (disposed) return
      canvas.dataset.ready = 'true'
      draw()
    })
    if (moving) {
      const animate = (time: number) => {
        draw(time)
        frame = requestAnimationFrame(animate)
      }
      frame = requestAnimationFrame(animate)
    }
    return () => { disposed = true; observer.disconnect(); cancelAnimationFrame(frame) }
  }, [onMetrics, night, moving, compact])
  return <canvas ref={ref} className="mr-canvas" aria-label="실제 게임 렌더러로 그린 물건과 조준점" />
}

export default function MobileReadability() {
  const [preset, setPreset] = useState<keyof typeof PRESETS>('standard')
  const [keyboard, setKeyboard] = useState(320)
  const [layout, setLayout] = useState('compact')
  const [dense, setDense] = useState(false)
  const [night, setNight] = useState(false)
  const [moving, setMoving] = useState(false)
  const [merge, setMerge] = useState(false)
  const [mergeSeq, setMergeSeq] = useState(0)
  const [congestion, setCongestion] = useState(60)
  const [metrics, setMetrics] = useState<Metrics>({ width: 0, height: 0, scale: 0 })
  const [width, height] = PRESETS[preset]
  const words = FIXTURE_WORDS.slice(0, dense ? 10 : 4)
  const scaleFactor = layout === 'original' ? width / 1200 : 1
  // Renderer measures the transformed CSS rect already; do not scale it twice.
  const visibleScale = metrics.scale
  const egg = VARIANT_BY_ID.get('egg')!
  const clover = VARIANT_BY_ID.get('clover')!

  return <main className="mr-page">
    <aside className="mr-controls">
      <h1>모바일 가독성 실험</h1>
      <p>실제 그림·렌더러 + 고정 장면. 물리 진행과 한글 입력은 검증하지 않습니다.</p>
      <p><a href="?mobile-play=1">직접 플레이하기 →</a></p>
      <label>화면<select value={preset} onChange={(event) => setPreset(event.target.value as keyof typeof PRESETS)}>
        <option value="compact">360 × 740</option><option value="standard">390 × 844</option><option value="large">430 × 932</option>
      </select></label>
      <label>배치<select value={layout} onChange={(event) => setLayout(event.target.value)}>
        <option value="compact">상자 확대 · 배경 · 경보</option><option value="stacked">단어를 위에 모으기</option><option value="original">기존 3열을 폭에 맞춰 축소</option>
      </select></label>
      <label>키보드 공간: {keyboard}px<input aria-label="키보드 공간" type="range" min="0" max="360" step="20" value={keyboard} onChange={(event) => setKeyboard(Number(event.target.value))} /></label>
      <label className="mr-check"><input type="checkbox" checked={dense} onChange={(event) => setDense(event.target.checked)} />단어 10개 (상한 스트레스)</label>
      <label className="mr-check"><input type="checkbox" checked={night} onChange={(event) => setNight(event.target.checked)} />밤</label>
      <label className="mr-check"><input type="checkbox" checked={merge} onChange={(event) => { setMerge(event.target.checked); if (event.target.checked) setMergeSeq((before) => before + 1) }} />긴 합성 이름 확인</label>
      <label>혼잡 경보: {congestion}%<input aria-label="경보 수치" type="range" min="0" max="100" value={congestion} onChange={(event) => setCongestion(Number(event.target.value))} /></label>
      <label className="mr-check"><input type="checkbox" checked={moving} onChange={(event) => setMoving(event.target.checked)} />화살표 움직이기</label>
      <dl>
        <dt>게임 가시 높이</dt><dd>{height - 64 - keyboard}px</dd>
        <dt>아레나 영역</dt><dd>{Math.round(metrics.width)} × {Math.round(metrics.height)}px</dd>
        <dt>단어 글꼴</dt><dd>{layout === 'original' ? (35 * scaleFactor).toFixed(1) : layout === 'compact' && dense ? 17 : 20}px</dd>
        <dt>계란 그림 높이</dt><dd data-metric="egg">{(egg.artBounds.hh * 2 * visibleScale).toFixed(1)}px</dd>
        <dt>클로버 그림 높이</dt><dd data-metric="clover">{(clover.artBounds.hh * 2 * visibleScale).toFixed(1)}px</dd>
      </dl>
      <p>브라우저 UI는 64px, 키보드는 선택한 높이를 예약한 가정입니다. 실제 기기 측정값이 아닙니다.</p>
      <p>회수 목록과 남은 시간 표시도 배치 가설이며, 실제 튜토리얼·합성 연출 검증은 후속입니다.</p>
    </aside>
    <div className="mr-phone" style={{ width, height } as CSSProperties} data-layout={layout} data-words={words.length}>
      <div className="mr-browser">배치 시제품 · 브라우저 공간 64px</div>
      <div className="mr-game" style={{ height: height - 64 - keyboard }}>
        <ArenaBackdrop mode="match" nightfall={night ? 1 : 0} />
        <header className="mp-hud"><div className="mp-summary"><strong>1,250점</strong><span>회수 4개 남음</span>{layout === 'compact' && <MobileMergeToast reveal={merge ? { seq: mergeSeq, label: LONG_RECIPE.result.label, sprite: LONG_RECIPE.result.sprite, from: LONG_RECIPE.inputs.map((id) => VARIANT_BY_ID.get(id)!).map((item) => ({label: item.label, sprite: item.sprite})) } : null} />}</div><MobileCongestion value={congestion} rushing={congestion === 100} /><button type="button" onClick={() => setMoving((before) => !before)}>{moving ? '멈춤' : '재생'}</button></header>
        <div className="mp-board-slot"><MobileWhiteboard words={['계란 프라이', '프라이팬', '노트북']} ready={['계란 프라이']} /></div>
        {layout !== 'original' && <div className="mr-words">{words.map((word) => {
          const entry = WORDS.find((item) => item.word === word.word)
          return <div className="mr-word" key={word.id} data-word={word.word} data-recall={word.word === '프라이팬' || word.word === '노트북'}>
            <span className="mr-word-label">{word.word}</span>
            {word.word === '프라이팬' || word.word === '노트북' ? <small className="mp-recall-badge">회수 대상</small> : entry !== undefined && <img src={entry.variants[0]?.sprite} width="22" height="22" alt="" />}
            <div className="mr-lifetime" style={{ width: `${(1 - word.y) * 100}%` }} />
          </div>
        })}</div>}
        <div className="mr-field">
          <div className="mr-scene" style={layout === 'original' ? {
            width: 1200, height: `${100 / scaleFactor}%`, transform: `scale(${scaleFactor})`, transformOrigin: 'top left',
          } : undefined}>
            <SceneCanvas onMetrics={setMetrics} night={night} moving={moving} compact={layout === 'compact'} />
            {layout === 'original' && <div className="mr-original-lanes"><TypingLane words={words} side="left" /><div /><TypingLane words={words} side="right" /></div>}
          </div>
        </div>
        <div className="mr-input"><div>프라이팬<span className="mr-caret">|</span></div></div>
      </div>
      {keyboard > 0 && <div className="mr-keyboard" style={{ height: keyboard }}><strong>가상 키보드 공간 · {keyboard}px</strong><span>이 영역에는 게임을 표시할 수 없음</span></div>}
    </div>
  </main>
}
