import { useEffect, useState } from 'react'
import { EngineStateStore } from '../hooks/useGameEngine.ts'
import { GameEngine } from '../game/core/GameEngine.ts'
import { ARENA_ART_SOURCES } from '../game/renderer/ArenaRenderer.ts'
import { preloadSprites } from '../game/renderer/spriteCache.ts'
import { MobileGame } from '../screens/MobileGameScreen.tsx'

export default function MobilePlay() {
  // A practice engine: no profile, collection persistence, ranking, or audio sinks.
  const [session, setSession] = useState<{ engine: GameEngine; store: EngineStateStore } | null>(null)
  const [error, setError] = useState(false)
  const engine = session?.engine
  useEffect(() => {
    let disposed = false
    let created: GameEngine | null = null
    void GameEngine.create(Date.now() >>> 0).then(async (instance) => {
      if (disposed) { instance.dispose(); return }
      created = instance
      await preloadSprites(ARENA_ART_SOURCES)
      if (disposed) return
      const store = new EngineStateStore()
      instance.onStateChange(store.update)
      setSession({ engine: instance, store })
    }).catch(() => { if (!disposed) setError(true) })
    return () => { disposed = true; created?.dispose() }
  }, [])
  const [viewport, setViewport] = useState(() => ({ height: window.visualViewport?.height ?? window.innerHeight, top: window.visualViewport?.offsetTop ?? 0 }))
  // Optional desktop-only keyboard space simulation. Real phones use visualViewport.
  const requested = Number(new URLSearchParams(window.location.search).get('keyboard') ?? 0)
  const keyboard = Number.isFinite(requested) ? Math.min(360, Math.max(0, requested)) : 0
  const availableHeight = Math.max(0, viewport.height - keyboard)
  useEffect(() => {
    if (availableHeight < 320) engine?.pause()
  }, [engine, availableHeight])
  useEffect(() => {
    const update = () => setViewport({ height: window.visualViewport?.height ?? window.innerHeight, top: window.visualViewport?.offsetTop ?? 0 })
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    return () => {
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])
  return <main className="mp-page" style={{ top: viewport.top, height: availableHeight }}>
    {session !== null ? <MobileGame engine={session.engine} store={session.store} /> : <p>{error ? '게임을 준비하지 못했어요. 새로고침해 주세요.' : '게임 준비 중…'}</p>}
    {availableHeight < 320 && <div className="mp-overlay">플레이 공간이 부족해 잠시 멈췄어요.<br />키보드를 닫거나 화면을 세로로 돌려주세요.</div>}
    {keyboard > 0 && <div className="mp-keyboard" style={{ height: keyboard }}>키보드 예약 공간 · {keyboard}px</div>}
  </main>
}
