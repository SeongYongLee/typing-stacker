import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { GameEngine, type GameState } from '../game/core/GameEngine.ts'
import { MobileGame, MobileViewport } from '../screens/MobileGameScreen.tsx'
import { EngineStateStore } from '../hooks/useGameEngine.ts'
import { useTooNarrow, useMobileControls } from '../hooks/useViewport.ts'
import { GameScreen } from '../screens/GameScreen.tsx'
import { ArenaRenderer, ARENA_ART_SOURCES } from '../game/renderer/ArenaRenderer.ts'
import type { ArenaRendererPort } from '../game/renderer/ArenaRendererPort.ts'
import { Arena3DRenderer } from '../game/renderer/three/Arena3DRenderer.ts'
import { ALL_VARIANTS, VARIANT_BY_ID } from '../game/data/words.ts'
import { preloadSprites } from '../game/renderer/spriteCache.ts'
import { soundBoard } from '../audio/SoundBoard.ts'
import { itemEffect, EFFECT_GROUPS } from '../game/renderer/three/ItemEffects.ts'
import { GallerySimulation, EXAMPLES } from './GallerySimulation.ts'
import './ThreePrototype.css'

const SEED = 20260907
type Mode = 'flat' | 'volume' | 'sticker' | '2d'
interface Settings { mode: Mode; angled: boolean; colliders: boolean; night: boolean; jelly: boolean; jellyStrength: number }

// Development-only inspection boundary; no storage, rankings or network are connected.
declare global {
  interface Window {
    __stacker3d?: { engine: GameEngine; getState(): GameState | null }
  }
}

function PrototypeArena({ engine, simulation, settings, gallery, compact = false, onError }: {
  engine: GameEngine; simulation: GallerySimulation; settings: Settings; gallery: boolean; compact?: boolean; onError(message: string): void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const threeRef = useRef<Arena3DRenderer | null>(null)
  const { mode, angled, colliders, night } = settings
  useLayoutEffect(() => {
    const canvas = canvasRef.current, overlay = overlayRef.current
    if (canvas === null || overlay === null) return
    let renderer: ArenaRendererPort
    try {
      renderer = mode === '2d'
        ? new ArenaRenderer(canvas, compact)
        : new Arena3DRenderer(canvas, overlay, {
          compact, style: mode, yaw: angled && !colliders ? Math.PI / 22.5 : 0,
          backgroundAlignment: gallery ? 'center' : 'bottom',
          colliders: colliders, night: night ? 1 : null,
        })
    } catch (error) {
      onError(error instanceof Error ? error.message : '3D 화면을 준비하지 못했습니다.')
      return
    }
    threeRef.current = renderer instanceof Arena3DRenderer ? renderer : null
    const port: ArenaRendererPort = night ? {
      draw: (state) => renderer.draw({ ...state, nightfall: 1 }),
      resize: () => renderer.resize(), dispose: () => renderer.dispose(),
    } : renderer
    if (gallery) simulation.attachRenderer(port)
    else engine.attachRenderer(port)
    const observer = new ResizeObserver(() => gallery ? simulation.handleResize() : engine.handleResize())
    observer.observe(canvas)
    const contextLost = (event: Event) => {
      event.preventDefault()
      onError('3D 그래픽 연결이 끊겼습니다. 2D로 전환해 같은 판을 계속할 수 있습니다.')
    }
    canvas.addEventListener('webglcontextlost', contextLost)
    return () => {
      threeRef.current = null
      observer.disconnect()
      canvas.removeEventListener('webglcontextlost', contextLost)
      if (gallery) simulation.detachRenderer()
      else engine.detachCanvas()
    }
  }, [engine, simulation, gallery, mode, angled, colliders, night, compact, onError])
  useLayoutEffect(() => {
    threeRef.current?.setJelly(settings.jelly ? settings.jellyStrength : 0)
  }, [mode, angled, colliders, night, settings.jelly, settings.jellyStrength])
  return <>
    <canvas className="three-canvas" ref={canvasRef} data-renderer={settings.mode} aria-label="깊이가 고정된 쌓기 아레나" />
    <canvas className="three-canvas three-effects" ref={overlayRef} aria-hidden="true" />
  </>
}

export default function ThreePrototype() {
  const narrow = useTooNarrow(800)
  const touch = useMobileControls()
  const mobile = narrow || touch
  const [store] = useState(() => new EngineStateStore())
  const [engine, setEngine] = useState<GameEngine | null>(null)
  const [simulation, setSimulation] = useState<GallerySimulation | null>(null)
  const [selectedItem, setSelectedItem] = useState<string>('study-book')
  const [catalogGroup, setCatalogGroup] = useState('examples')
  const [search, setSearch] = useState('')
  const [dropX, setDropX] = useState(0)
  const [dropPaused, setDropPaused] = useState(false)
  const [state, setState] = useState<GameState | null>(null)
  const [error, setError] = useState('')
  const [settings, setSettings] = useState<Settings>({ mode: 'flat', angled: false, colliders: false, night: false, jelly: true, jellyStrength: 0.65 })
  const [gallery, setGallery] = useState(true)
  const [tutorial, setTutorial] = useState(true)
  const [metrics, setMetrics] = useState('')
  const latest = useRef<GameState | null>(null)

  useEffect(() => {
    let disposed = false
    let created: GameEngine | null = null
    let tray: GallerySimulation | null = null
    void Promise.all([
      GameEngine.create(SEED),
      GallerySimulation.create(),
      preloadSprites([...ARENA_ART_SOURCES, ...ALL_VARIANTS.map((item) => item.sprite)]),
    ]).then(([instance, gallerySimulation]) => {
      if (disposed) { instance.dispose(); gallerySimulation.dispose(); return }
      tray = gallerySimulation
      setSimulation(gallerySimulation)
      created = instance
      instance.onStateChange((next) => { latest.current = next; store.update(next); setState(next) })
      instance.onEvent((event) => soundBoard().handle(event))
      window.__stacker3d = { engine: instance, getState: () => latest.current }
      instance.startRun(true)
      instance.pause()
      setEngine(instance)
    }).catch((reason: unknown) => {
      if (!disposed) setError(reason instanceof Error ? reason.message : '게임을 준비하지 못했습니다.')
    })
    return () => {
      disposed = true
      if (window.__stacker3d?.engine === created) delete window.__stacker3d
      created?.dispose()
      tray?.dispose()
    }
  }, [store])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('[data-renderer]')
      if (canvas?.dataset.ready !== 'true') { setMetrics('Canvas 2D'); return }
      setMetrics(`물건 ${canvas.dataset.bodies} · 도형 ${canvas.dataset.geometries} · 텍스처 ${canvas.dataset.textures} · 그리기 ${canvas.dataset.drawCalls}회`)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  const start = (showTutorial: boolean) => {
    if (engine === null) return
    engine.reseed(SEED)
    engine.startRun(showTutorial)
    setTutorial(showTutorial); setGallery(false)
  }
  const change = (next: Partial<Settings>) => {
    setError('')
    setSettings((before) => ({ ...before, ...next }))
  }
  const backToGallery = () => { engine?.pause(); setGallery(true) }
  const groupIds: readonly string[] | undefined = catalogGroup === 'examples' ? EXAMPLES : EFFECT_GROUPS.find((group) => group.id === catalogGroup)?.ids
  const catalog = (groupIds === undefined ? ALL_VARIANTS : groupIds.map((id) => VARIANT_BY_ID.get(id)!))
    .filter((item) => `${item.label} ${item.id}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
  const sceneKey = `${settings.mode}:${settings.angled}:${settings.colliders}:${settings.night}:${gallery}:${mobile}`
  const arena = engine === null || simulation === null ? null : <PrototypeArena key={sceneKey} engine={engine} simulation={simulation} settings={settings} gallery={gallery} compact={mobile && !gallery} onError={setError} />

  return <main className="three-page">
    <header className="three-toolbar">
      <div className="three-title"><span>수상한 분실물 보관소</span><strong>반입 시험장</strong></div>
      <span className="three-serial">작업대 03 / 취급 주의</span>
      <details className="three-settings"><summary>화면 설정</summary><div className="three-settings-body">
      <div className="three-switch" role="group" aria-label="물건 표현">
        {([['flat', '2D 물건 + 3D 상자'], ['2d', '기존 2D'], ['sticker', '두꺼운 스티커'], ['volume', '볼륨 모델']] as const).map(([mode, label]) =>
          <button key={mode} type="button" aria-pressed={settings.mode === mode} onClick={() => change({ mode })}>{label}</button>)}
      </div>
      <label><input type="checkbox" checked={settings.angled} disabled={settings.mode === '2d' || settings.colliders} onChange={(event) => change({ angled: event.target.checked })} />옆면 보기 8°</label>
      <label><input type="checkbox" checked={settings.colliders} disabled={settings.mode === '2d'} onChange={(event) => change({ colliders: event.target.checked })} />충돌 윤곽</label>
      <label><input type="checkbox" checked={settings.night} onChange={(event) => change({ night: event.target.checked })} />밤 조명</label>
      <label><input type="checkbox" checked={settings.jelly} disabled={settings.mode === '2d' || settings.colliders} onChange={(event) => change({ jelly: event.target.checked })} />젤리 반응</label>
      <label>강도 {Math.round(settings.jellyStrength * 100)}%<input className="three-jelly-range" aria-label="젤리 강도" type="range" min="0" max="1" step="0.05" value={settings.jellyStrength} disabled={!settings.jelly || settings.mode === '2d' || settings.colliders} onChange={(event) => change({ jellyStrength: Number(event.target.value) })} /></label>
      <output>{metrics}</output>
      </div></details>
      <a href="/">보관소로 돌아가기 ↗</a>
    </header>
    <nav className="three-actions" aria-label="실험 진행">
      <button type="button" className={gallery ? 'three-primary' : undefined} onClick={backToGallery} disabled={engine === null}>물건 비교</button>
      <button type="button" className={!gallery && tutorial ? 'three-primary' : undefined} onClick={() => start(true)} disabled={engine === null}>튜토리얼 플레이</button>
      <button type="button" className={!gallery && !tutorial ? 'three-primary' : undefined} onClick={() => start(false)} disabled={engine === null}>싱글 새로 시작</button>
      {!gallery && <button type="button" onClick={() => state?.phase === 'paused' ? engine?.resume() : engine?.pause()}>{state?.phase === 'paused' ? '계속하기' : '일시정지'}</button>}
      <span className="three-nav-note">물건을 골라 상자에 넣어보세요.</span>
    </nav>
    {error && <div className="three-error" role="alert">{error} <button type="button" onClick={() => change({ mode: '2d' })}>2D로 전환</button></div>}
    <section className={`three-stage ${gallery ? 'three-gallery' : 'three-play'}`}>
      {engine === null || state === null ? <p className="three-loading">물건과 보관소를 준비하고 있어요…</p> : gallery ? <>
        <div className="three-gallery-background" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}arena/background-${settings.night ? 'night' : 'day'}.webp)` }} />
        {arena}
        <div className="three-drop-controls">
          <div className="three-ledger-heading"><span>반입 대장</span><small>{catalog.length} / {ALL_VARIANTS.length}종</small></div>
          <p>이름을 누르면 한 개씩 떨어집니다.</p>
          <div className="three-catalog-filter">
            <select aria-label="물건 분류" value={catalogGroup} onChange={(event) => { setCatalogGroup(event.target.value); setSearch('') }}>
              <option value="examples">대표 6종</option><option value="all">전체 물건</option>
              {EFFECT_GROUPS.map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}
            </select>
            <input type="search" aria-label="물건 검색" placeholder="목록에서 이름 찾기" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <div className="three-drop-items">{catalog.map((item, index) => {
            const id = item.id
            return <button type="button" key={id} data-item-id={id} title={itemEffect(item).label} aria-label={`${item.label} 떨어뜨리기`} aria-pressed={selectedItem === id} onClick={() => { setSelectedItem(id); simulation?.drop(id, dropX) }}>
              <small>{String(index + 1).padStart(2, '0')}</small><img src={item.sprite} alt="" width="44" height="44" /><span>{item.label}</span><b aria-hidden="true">↓</b>
            </button>
          })}{catalog.length === 0 && <p role="status">찾는 물건이 없습니다.</p>}</div>
          <label>낙하 위치 · {dropX === 0 ? '가운데' : dropX < 0 ? '왼쪽' : '오른쪽'}
            <input aria-label="낙하 위치" type="range" min="-1.6" max="1.6" step="0.1" value={dropX} onChange={(event) => setDropX(Number(event.target.value))} />
          </label>
          <div className="three-drop-actions">
            <button type="button" onClick={() => { simulation?.setPaused(false); setDropPaused(false); simulation?.dropAll(catalog.map((item) => item.id)) }} disabled={catalog.length === 0}>{catalogGroup === 'examples' && !search ? '6종 모두 떨어뜨리기' : `목록 ${Math.min(6, catalog.length)}종 낙하`}</button>
            <button type="button" onClick={() => { simulation?.setPaused(!dropPaused); setDropPaused(!dropPaused) }}>{dropPaused ? '낙하 계속' : '낙하 멈춤'}</button>
            <button type="button" onClick={() => simulation?.clear()}>상자 비우기</button>
            <button type="button" onClick={() => simulation?.arrange()}>비교 배치로 복원</button>
          </div>
          <p>한 상자에 60개까지. 비교 중에는 합성되지 않습니다.</p>
        </div>
        <aside className="three-effect-slip" aria-label="이펙트 시험">
          <span className="three-stamp">취급 주의</span>
          <h1>떨어지고,<br />부딪히고,<br />주인을 찾고.</h1>
          <p>종이는 팔랑, 금속은 반짝. 물건마다 다른 착지 효과를 확인해 보세요.</p>
          <div className="three-effect-buttons">
            <button type="button" onClick={() => { simulation?.previewEffect('merge'); setDropPaused(false) }}>합성 이펙트 <span aria-hidden="true">↗</span></button>
            <button type="button" onClick={() => { simulation?.previewEffect('merge', 'magic-book'); setDropPaused(false) }}>4개 합성 <span aria-hidden="true">↗</span></button>
            <button type="button" onClick={() => { simulation?.previewEffect('merge', 'mirror-door'); setDropPaused(false) }}>5개 합성 <span aria-hidden="true">↗</span></button>
            <button type="button" onClick={() => { simulation?.previewEffect('recall', selectedItem); setDropPaused(false) }}>회수 이펙트 <span aria-hidden="true">↗</span></button>
          </div>
          <small>합성은 계란과 프라이팬, 회수는 선택한 물건으로 재생합니다.</small>
          <div className="three-slip-sign">담당자 · 고양이</div>
        </aside>
        <div className="three-gallery-note"><strong>{VARIANT_BY_ID.get(selectedItem)!.label}</strong><br />{itemEffect(VARIANT_BY_ID.get(selectedItem)).label}</div>
      </> : <>
        {mobile ? <MobileViewport engine={engine} touch={touch}><MobileGame engine={engine} store={store} touch={touch} arena={arena} windowLight={settings.mode === '2d'} onRestart={() => start(tutorial)} onHome={backToGallery} /></MobileViewport> : <GameScreen windowLight={settings.mode === '2d'} showRanking={false} engine={engine} state={settings.night ? { ...state, timeOfDay: { ...state.timeOfDay, nightfall: 1 } } : state} arena={arena} onRestart={() => start(tutorial)} onHome={backToGallery} />}
        {(state.phase === 'over' || state.phase === 'credits') && <div className="three-result" style={mobile ? { position: 'fixed' } : undefined} role="dialog" aria-label="실험 결과">
          <h2>{state.phase === 'credits' ? '모든 주인을 찾았습니다' : '이번 보관은 여기까지'}</h2>
          <p>쌓은 물건 {state.stats.stackCount}개 · 회수 {state.stage.totalReturns}개</p>
          <button type="button" onClick={() => start(tutorial)}>같은 시드로 다시 하기</button>
          {state.phase === 'credits' && <button type="button" onClick={() => engine.continueEndless()}>계속 정리하기</button>}
          <button type="button" onClick={backToGallery}>물건 비교로 돌아가기</button>
        </div>}
      </>}
    </section>
    <footer className="three-footer"><span>깊이 고정 · 좌우 조준 · Enter 한 번</span><span>시험 반입 · 기록은 저장하지 않습니다</span></footer>
  </main>
}
