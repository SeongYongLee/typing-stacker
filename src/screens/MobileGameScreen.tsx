import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { EngineStateStore } from '../hooks/useGameEngine.ts'
import type { GameEngine } from '../game/core/GameEngine.ts'
import { ArenaBackdrop } from '../components/ArenaBackdrop.tsx'
import { MobileCongestion, MobileMergeToast, MobileWhiteboard } from './MobileGameInfo.tsx'
import { PauseOverlay } from './PauseOverlay.tsx'
import { OptionsScreen } from './OptionsScreen.tsx'
import './MobileGameScreen.css'

export function MobileGame({ engine, store, onHome, onRestart }: {
  engine: GameEngine; store: EngineStateStore; onHome?: () => void; onRestart?: () => void
}) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const canvas = useRef<HTMLCanvasElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [options, setOptions] = useState(false)
  const composing = useRef(false)
  const submittedComposition = useRef<string | null>(null)
  const [recallFeedbackSeq, setRecallFeedbackSeq] = useState<number | null>(null)

  useLayoutEffect(() => {
    if (canvas.current === null) return
    engine.attachCanvas(canvas.current, true)
    const observer = new ResizeObserver(() => engine.handleResize())
    observer.observe(canvas.current)
    return () => { observer.disconnect(); engine.detachCanvas() }
  }, [engine, onHome, state?.runSeq])
  useEffect(() => {
    const hide = () => { if (document.hidden) engine.pause() }
    document.addEventListener('visibilitychange', hide)
    return () => document.removeEventListener('visibilitychange', hide)
  }, [engine])
  useEffect(() => {
    if (state?.phase === 'playing' && onHome !== undefined && document.activeElement !== input.current) {
      engine.pause()
    } else if (state?.phase !== 'playing' && state?.phase !== 'stageTransition') {
      input.current?.blur()
    }
  }, [engine, onHome, state?.phase])
  if (state === null) return null

  const playing = state.phase === 'playing'
  const start = () => {
    if (state.phase === 'paused') engine.resume()
    else engine.startRun(false)
    submittedComposition.current = null
    setRecallFeedbackSeq(null)
    if (input.current !== null) { input.current.value = ''; input.current.focus() }
  }
  const acceptsEmpty = state.stage.tutorialStep === 0 || state.stage.tutorialStep === 4 ||
    state.stage.tutorialStep === 5 || state.stage.tutorialStep === 6 ||
    ['ready', 'congestionGuide', 'full', 'gameOverPrompt'].includes(state.stage.congestionDemo ?? '')
  const submit = () => {
    const element = input.current
    if (state.stage.congestionDemo === 'wordRush' || !playing || element === null || (element.value.trim() === '' && !acceptsEmpty)) return
    const text = element.value
    submittedComposition.current = composing.current ? text : null
    const willRecall = state.activeWhiteboard.includes(text.trim())
    engine.submit(text)
    const result = store.getSnapshot()?.feedback
    setRecallFeedbackSeq(willRecall && result?.ok && result.seq !== state.feedback?.seq ? result.seq : null)
    element.value = ''
  }
  const words = state.words.filter((word) => word.state === 'active')
  const feedback = state.feedback
  const idle = !playing && state.phase !== 'collapsing'

  return <div className="mp-game" data-phase={state.phase}>
    <ArenaBackdrop mode="solo" time={state.timeOfDay} />
    <header className="mp-hud"><div className="mp-summary"><strong>{state.stats.score.toLocaleString()}점</strong><span>회수 {state.stage.returns}/{state.stage.target ?? '∞'}</span><MobileMergeToast key={state.runSeq} reveal={state.mergeReveal} /></div><MobileCongestion value={state.stage.congestion} rushing={state.stage.congestionRush} /><button type="button" onClick={() => { engine.pause(); input.current?.blur() }}>일시정지</button></header>
    <div className="mp-board-slot">
      <MobileWhiteboard words={state.whiteboard} ready={state.activeWhiteboard} />
    </div>
    <div className="mp-words" data-dense={words.length > 6} data-count={words.length}>
      {words.map((word) => <div className="mp-word" key={word.id} data-word={word.word} data-recall={state.whiteboard.includes(word.word)}>
        <span>{word.word}</span>
        {state.whiteboard.includes(word.word) ? <small className="mp-recall-badge">{state.activeWhiteboard.includes(word.word) ? '회수' : '회수 대상'}</small> : <span className="mp-partners">{state.wordMergeHints.get(word.word)?.map((hint) => <img key={hint.id} width="18" height="18" src={hint.sprite} alt="합성 짝" />)}</span>}
        <i style={{ width: `${Math.max(0, 1 - word.y) * 100}%` }} />
      </div>)}
      {words.length === 0 && <span className="mp-empty">{playing ? '다음 단어를 기다리는 중…' : '단어를 입력하고 키보드의 Enter를 누르세요'}</span>}
    </div>
    <div className="mp-arena">
      <canvas ref={canvas} aria-label="상자와 쌓인 물건" />
      {playing && (state.stage.tutorialText !== null || state.stage.congestionDemo === 'gameOverPrompt') && <div className="mp-tutorial" role="status">{state.stage.congestionDemo === 'gameOverPrompt' ? '물건이 밖으로 떨어지고 고양이가 나오면 게임오버입니다. Enter를 눌러 결과를 확인하세요.' : state.stage.tutorialText}</div>}
      {playing && state.stage.notice !== null && <div className="mp-stage-notice">{state.stage.notice.title}</div>}
      {idle && onHome === undefined && <div className="mp-overlay"><strong>{state.phase === 'paused' ? '잠시 멈췄어요' : state.phase === 'over' ? '게임 끝' : '모바일 쌓기 실험'}</strong><p>단어를 입력하면 위에서 물건이 떨어집니다</p><button type="button" onClick={start}>{state.phase === 'paused' ? '계속하기' : '입력하고 시작'}</button><a href="?mobile-readability=1">배치 비교로 돌아가기</a></div>}
      {state.phase === 'collapsing' && <div className="mp-overlay">무너지고 있어요…</div>}
    </div>
    <div className="mp-feedback" role="status" data-ok={feedback?.ok}>{feedback === null ? '일반 단어는 쌓기 · 화이트보드는 회수' : feedback.seq === recallFeedbackSeq ? `${feedback.text} 회수 완료 ✓` : `${feedback.text} ${feedback.ok ? '✓' : '✗'}${feedback.hidden ? ` → ${feedback.itemLabel}` : ''}`}</div>
    {onHome !== undefined && state.phase === 'paused' && !options && <PauseOverlay onResume={start} onRestart={onRestart ?? start} onHome={onHome} onOptions={() => setOptions(true)} />}
    {onHome !== undefined && state.phase === 'paused' && options && <div className="mp-options"><OptionsScreen onBack={() => setOptions(false)} /></div>}
    <form className="mp-input" onSubmit={(event) => { event.preventDefault(); submit() }}>
      <input ref={input} aria-label="단어 입력" name="word" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="enter" placeholder="단어 입력…"
        onBlur={() => engine.pause()}
        onCompositionStart={() => { composing.current = true; submittedComposition.current = null }}
        onCompositionEnd={(event) => {
          composing.current = false
          if (submittedComposition.current === event.currentTarget.value) event.currentTarget.value = ''
        }}
        onInput={(event) => {
          if (submittedComposition.current === event.currentTarget.value) event.currentTarget.value = ''
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') submittedComposition.current = null
          if (event.key === 'Enter') { event.preventDefault(); submit() }
        }}
      />
    </form>
  </div>
}


export function MobileViewport({ engine, children }: { engine: GameEngine; children: ReactNode }) {
  const [viewport, setViewport] = useState(() => ({ height: window.visualViewport?.height ?? window.innerHeight, top: window.visualViewport?.offsetTop ?? 0 }))
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
  useEffect(() => { if (viewport.height < 320) engine.pause() }, [engine, viewport.height])
  return <main className="mp-page" style={{ top: viewport.top, height: viewport.height }}>
    {children}
    {viewport.height < 320 && <div className="mp-overlay">플레이 공간이 부족해 잠시 멈췄어요.<br />키보드를 닫거나 화면을 세로로 돌려주세요.</div>}
  </main>
}
