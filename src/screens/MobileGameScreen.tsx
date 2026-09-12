import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { EngineStateStore } from '../hooks/useGameEngine.ts'
import type { GameEngine } from '../game/core/GameEngine.ts'
import { ArenaBackdrop } from '../components/ArenaBackdrop.tsx'
import { MobileCongestion, MobileMergeToast, MobileWhiteboard } from './MobileGameInfo.tsx'
import { PauseOverlay } from './PauseOverlay.tsx'
import { OptionsScreen } from './OptionsScreen.tsx'
import './MobileGameScreen.css'
import { tutorialGuide } from './tutorialGuide.ts'

export function MobileGame({ engine, store, onHome, onRestart, touch = true }: {
  touch?: boolean; engine: GameEngine; store: EngineStateStore; onHome?: () => void; onRestart?: () => void
}) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const canvas = useRef<HTMLCanvasElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [options, setOptions] = useState(false)
  // A new run waits at the input, while an interrupted run uses the pause menu.
  const [awaitingStart, setAwaitingStart] = useState(() => (
    touch && onHome !== undefined && (state === null || (
      state.phase !== 'paused' && state.stage.notice?.kind === 'start' && state.stage.totalReturns === 0
    ))
  ))
  const [openingKeyboard, setOpeningKeyboard] = useState(false)
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
    const hide = () => {
      if (document.hidden) {
        setOpeningKeyboard(false)
        engine.pause()
        input.current?.blur()
      }
    }
    document.addEventListener('visibilitychange', hide)
    return () => document.removeEventListener('visibilitychange', hide)
  }, [engine])
  useEffect(() => {
    if (state?.phase === 'playing' && !touch) input.current?.focus()
    if (touch && state?.phase === 'playing' && onHome !== undefined && (awaitingStart || document.activeElement !== input.current)) {
      engine.pause()
    } else if (state?.phase !== 'playing' && state?.phase !== 'stageTransition' && !openingKeyboard) {
      input.current?.blur()
    }
  }, [engine, onHome, state?.phase, awaitingStart, openingKeyboard, touch])
  useEffect(() => {
    if (!openingKeyboard) return
    // Wait for the keyboard animation to stop changing the usable play area.
    // The fallback also lets external keyboards start without a viewport resize.
    const finish = () => {
      if (document.hidden || document.activeElement !== input.current || (window.visualViewport?.height ?? window.innerHeight) < 320) {
        setOpeningKeyboard(false)
        input.current?.blur()
        return
      }
      engine.handleResize()
      setAwaitingStart(false)
      setOpeningKeyboard(false)
      engine.resume()
    }
    let timer = window.setTimeout(finish, 500)
    const resized = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(finish, 200)
    }
    window.visualViewport?.addEventListener('resize', resized)
    window.visualViewport?.addEventListener('scroll', resized)
    return () => {
      window.clearTimeout(timer)
      window.visualViewport?.removeEventListener('resize', resized)
      window.visualViewport?.removeEventListener('scroll', resized)
    }
  }, [engine, openingKeyboard])
  if (state === null) return null

  const playing = state.phase === 'playing'
  const start = () => {
    if (state.phase === 'paused') engine.resume()
    else engine.startRun(false)
    submittedComposition.current = null
    setRecallFeedbackSeq(null)
    if (input.current !== null) { input.current.value = ''; input.current.focus() }
  }
  const guide = tutorialGuide(state.stage, touch)
  const acceptsEmpty = guide?.action != null
  const submit = () => {
    const element = input.current
    if (guide?.waiting || !playing || element === null || (element.value.trim() === '' && !acceptsEmpty)) return
    const text = acceptsEmpty ? '' : element.value
    submittedComposition.current = composing.current ? text : null
    const willRecall = state.activeWhiteboard.includes(text.trim())
    engine.submit(text)
    const result = store.getSnapshot()?.feedback
    setRecallFeedbackSeq(willRecall && result?.ok && result.seq !== state.feedback?.seq ? result.seq : null)
    element.value = ''
  }
  const tutorialStep = state.stage.tutorialStep
  const demo = state.stage.congestionDemo
  const tutorialText = guide?.text ?? null
  const showTutorialAction = touch && playing && acceptsEmpty
  const advanceTutorial = () => {
    if (!playing || !acceptsEmpty) return
    input.current?.focus()
    engine.submit('')
  }
  const words = state.words.filter((word) => word.state === 'active')
  const feedback = state.feedback
  const idle = !playing && state.phase !== 'collapsing'

  return <div className="mp-game" data-controls={touch ? 'mobile' : 'pc'} data-phase={state.phase} data-awaiting-start={awaitingStart}>
    <ArenaBackdrop mode="solo" time={state.timeOfDay} />
    <header className="mp-hud"><div className="mp-summary"><strong>{state.stats.score.toLocaleString()}점</strong><span>회수 {state.stage.returns}/{state.stage.target ?? '∞'}</span><MobileMergeToast key={state.runSeq} reveal={state.mergeReveal} /></div><MobileCongestion value={state.stage.congestion} rushing={state.stage.congestionRush} /><button className="menu-button menu-button--compact" type="button" onClick={() => { setAwaitingStart(false); setOpeningKeyboard(false); engine.pause(); input.current?.blur() }}>{touch ? '일시정지' : '일시정지 · Esc'}</button></header>
    <div className="mp-board-slot" data-tutorial-guide={playing && tutorialStep === 7 && demo === null}>
      <MobileWhiteboard words={state.whiteboard} ready={state.activeWhiteboard} />
    </div>
    {playing && tutorialText !== null && <div className="mp-tutorial">
      <div role="status"><strong className="mp-tutorial-title">{guide?.title}</strong><p>{tutorialText}</p>{touch && tutorialStep === 1 && demo === null && <small>키보드에 따라 ↵ 대신 완료·이동 등으로 표시될 수 있어요.</small>}</div>
    </div>}
    <div hidden={playing && tutorialText !== null && words.length === 0} className="mp-words" data-dense={words.length > 6} data-count={words.length}>
      {words.map((word) => <div className="mp-word" key={word.id} data-word={word.word} data-recall={state.whiteboard.includes(word.word)}>
        <span>{word.word}</span>
        {state.whiteboard.includes(word.word) ? <small className="mp-recall-badge">{state.activeWhiteboard.includes(word.word) ? '회수' : '회수 대상'}</small> : <span className="mp-partners">{state.wordMergeHints.get(word.word)?.map((hint) => <img key={hint.id} width="18" height="18" src={hint.sprite} alt="합성 짝" />)}</span>}
        <i style={{ width: `${Math.max(0, 1 - word.y) * 100}%` }} />
      </div>)}
      {words.length === 0 && <span className="mp-empty">{playing ? '다음 단어를 기다리는 중…' : '입력창을 눌러 시작하세요'}</span>}
    </div>
    <div className="mp-arena">
      <canvas ref={canvas} aria-label="상자와 쌓인 물건" />
      {playing && state.stage.notice !== null && <div className="mp-stage-notice">{state.stage.notice.title}</div>}
      {idle && onHome === undefined && <div className="mp-overlay"><strong>{state.phase === 'paused' ? '잠시 멈췄어요' : state.phase === 'over' ? '게임 끝' : '모바일 쌓기 실험'}</strong><p>단어를 입력하면 위에서 물건이 떨어집니다</p><button className="menu-button" data-primary="yes" type="button" onClick={start}>{state.phase === 'paused' ? '계속하기' : '입력하고 시작'}</button><a href="?mobile-readability=1">배치 비교로 돌아가기</a></div>}
      {state.phase === 'collapsing' && <div className="mp-overlay">무너지고 있어요…</div>}
    </div>
    <div className="mp-feedback" role="status" data-ok={feedback?.ok}>{awaitingStart ? openingKeyboard ? '키보드 준비 중…' : '아래 입력창을 누르면 시작합니다' : feedback === null ? '일반 단어는 쌓기 · 화이트보드는 회수' : feedback.seq === recallFeedbackSeq ? `${feedback.text} 회수 완료 ✓` : `${feedback.text} ${feedback.ok ? '✓' : '✗'}${feedback.hidden ? ` → ${feedback.itemLabel}` : ''}`}</div>
    {onHome !== undefined && !awaitingStart && state.phase === 'paused' && !options && <PauseOverlay onResume={start} onRestart={onRestart ?? start} onHome={onHome} onOptions={() => setOptions(true)} />}
    {onHome !== undefined && state.phase === 'paused' && options && <div className="mp-options"><OptionsScreen onBack={() => setOptions(false)} /></div>}
    <form className="mp-input" data-tutorial-action={showTutorialAction} onSubmit={(event) => { event.preventDefault(); submit() }}>
      {showTutorialAction && <button className="menu-button menu-button--compact mp-tutorial-next" data-primary="yes" type="button" data-tutorial-next onPointerDown={(event) => event.preventDefault()} onClick={advanceTutorial}>{guide?.action}</button>}
      <input ref={input} tabIndex={showTutorialAction ? -1 : undefined} onBeforeInput={(event) => { if (showTutorialAction || guide?.waiting) event.preventDefault() }} aria-label="단어 입력" name="word" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="enter" placeholder={awaitingStart ? '눌러서 시작' : guide?.waiting ? '시연을 보고 있어요…' : !touch && guide?.action ? `Enter · ${guide.action}` : '단어 입력…'}
        onFocus={() => { if (awaitingStart) setOpeningKeyboard(true) }}
        onBlur={(event) => { if (event.relatedTarget instanceof HTMLElement && event.relatedTarget.matches('[data-tutorial-next]')) return; setOpeningKeyboard(false); engine.pause() }}
        onCompositionStart={() => { composing.current = true; submittedComposition.current = null }}
        onCompositionEnd={(event) => {
          composing.current = false
          if (submittedComposition.current === event.currentTarget.value) event.currentTarget.value = ''
        }}
        onInput={(event) => {
          if (submittedComposition.current === event.currentTarget.value) event.currentTarget.value = ''
        }}
        onKeyDown={(event) => {
          if (!touch && event.key === 'Escape' && playing) { event.preventDefault(); event.stopPropagation(); engine.pause(); input.current?.blur(); return }
          if (event.key !== 'Enter') submittedComposition.current = null
          if (event.key === 'Enter') { event.preventDefault(); submit() }
        }}
      />
    </form>
  </div>
}


export function MobileViewport({ engine, children, touch = true }: { engine: GameEngine; children: ReactNode; touch?: boolean }) {
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
  return <main className="mp-page" data-controls={touch ? 'mobile' : 'pc'} style={{ top: viewport.top, height: viewport.height }}>
    {children}
    {viewport.height < 320 && <div className="mp-overlay">플레이 공간이 부족해 잠시 멈췄어요.<br />키보드를 닫거나 화면을 세로로 돌려주세요.</div>}
  </main>
}
