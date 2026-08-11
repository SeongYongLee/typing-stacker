import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { ARENA_ART } from '../game/renderer/arenaArt.generated.ts'
import { ArenaClock } from './ArenaClock.tsx'
import { WHITEBOARD_SCALE, whiteboardWordChanges } from './whiteboardTransition.ts'
import type { TimeOfDay } from '../game/systems/DayNight.ts'

type ArenaBackdropProps =
  | {
      mode: 'solo'
      /** 판의 국면. 조명과 벽시계가 이것을 따라간다. */
      time: TimeOfDay
      /** 지금 회수할 수 있는 단어. 없으면 보드 그림만 건다. */
      whiteboard?: readonly string[]
      /** 회수 목록 중 지금 레인에 내려와 있는 단어. 이때만 보드에 작은 표시를 남긴다. */
      activeWhiteboard?: readonly string[]
    }
  | {
      mode: 'match'
      /** 현재 현지 시각에 따라 고정한 조명. 0은 낮, 1은 밤이다. */
      nightfall: 0 | 1
      whiteboard?: readonly string[]
      activeWhiteboard?: readonly string[]
      /** 대결에서 방금 화이트보드 단어를 회수한 사람과 원래 자리. */
      whiteboardClaim?: WhiteboardClaimNotice | null
    }

interface WhiteboardClaimNotice {
  readonly seq: number
  readonly word: string
  readonly index: number
  readonly label: string
}

/**
 * 판 뒤에 깔리는 분실물 보관소.
 *
 * **캔버스가 아니라 DOM이다.** 아레나 캔버스는 `clearRect`로 지워 투명하게 두고
 * 그 뒤를 이 층이 채운다. 캔버스에 그리면 프레임마다 큰 그림을 두 장씩 다시
 * 그리게 되는데, 배경은 한 판 내내 거의 바뀌지 않으므로 그 비용이 통째로 낭비다.
 * DOM에 두면 브라우저가 알아서 합성하고, 낮/밤은 알파 하나만 움직이면 된다.
 *
 * 두 장을 겹쳐두고 **밤의 투명도만** 올린다. 색을 섞어 만들지 않는 이유는
 * `ArenaRenderer.drawDayNight`와 같다 — 두 그림이 같은 구도라 겹치는 것으로 충분하고,
 * 계산해 섞으면 붓질과 그림자가 뭉개진다.
 */
function ArenaBackdrop(props: ArenaBackdropProps) {
  if (props.mode === 'match') {
    return (
      <BackdropLayers
        nightfall={props.nightfall}
        whiteboard={props.whiteboard ?? []}
        activeWhiteboard={props.activeWhiteboard ?? []}
        whiteboardClaim={props.whiteboardClaim ?? null}
      />
    )
  }
  return (
    <SoloArenaBackdrop
      time={props.time}
      whiteboard={props.whiteboard ?? []}
      activeWhiteboard={props.activeWhiteboard ?? []}
    />
  )
}

function BackdropLayers({
  nightfall,
  whiteboard,
  activeWhiteboard,
  whiteboardClaim,
}: {
  nightfall: number
  whiteboard: readonly string[]
  activeWhiteboard: readonly string[]
  whiteboardClaim: WhiteboardClaimNotice | null
}) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const wall = useWallBox(rootRef)
  return (
    <div ref={rootRef} aria-hidden style={rootStyle}>
      <div style={layerStyle('background-day', 1)} />
      <div style={layerStyle('background-night', nightfall)} />
      {wall !== null && (
        <div style={wall}>
          <WindowLight nightfall={nightfall} />
          <Whiteboard
            words={whiteboard}
            activeWords={activeWhiteboard}
            nightfall={nightfall}
            claim={whiteboardClaim}
          />
        </div>
      )}
    </div>
  )
}

function SoloArenaBackdrop({
  time,
  whiteboard,
  activeWhiteboard,
}: {
  time: TimeOfDay
  whiteboard: readonly string[]
  activeWhiteboard: readonly string[]
}) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const wall = useWallBox(rootRef)
  return (
    <div ref={rootRef} style={rootStyle}>
      <div aria-hidden style={layerStyle('background-day', 1)} />
      <div aria-hidden style={layerStyle('background-night', time.nightfall)} />
      {/*
        벽에 거는 것들은 **그림에 붙어야** 한다. 화면이 아니라 방의 좌표다 —
        창문 옆 그 자리에 걸린 것이지 화면 오른쪽 위에 떠 있는 것이 아니다.
      */}
      {wall !== null && (
        <div style={wall}>
          <WindowLight nightfall={time.nightfall} />
          <Whiteboard
            words={whiteboard}
            activeWords={activeWhiteboard}
            nightfall={time.nightfall}
          />
          <ArenaClock time={time} />
        </div>
      )}
    </div>
  )
}

/** 왼쪽 창문에서 들어오는 햇빛/밤빛. 배경 그림의 방 좌표에 붙여 화면비가 바뀌어도 밀리지 않는다. */
function WindowLight({ nightfall }: { nightfall: number }) {
  const dayAlpha = 1 - nightfall
  return (
    <div aria-hidden style={windowLightRootStyle}>
      <style>{windowLightAnimationCss}</style>
      <div style={windowBeamStyle('day', dayAlpha)} />
      <div data-window-wash style={windowWashStyle(dayAlpha)} />
      <div data-window-ray style={windowRayStyle(0, dayAlpha)} />
      <div data-window-ray style={windowRayStyle(1, dayAlpha)} />
      <div data-window-ray style={windowRayStyle(2, dayAlpha)} />
      <div data-window-motes style={windowMotesStyle(dayAlpha)} />
      <div data-window-glow style={windowGlowStyle(dayAlpha)} />
      <div style={windowBeamStyle('night', nightfall)} />
      <div style={windowPoolStyle('day', dayAlpha)} />
      <div style={windowPoolStyle('night', nightfall)} />
    </div>
  )
}

/**
 * 배경 그림이 **실제로 그려진 사각형**. 벽에 거는 것들이 여기에 붙는다.
 *
 * 배경은 `cover`라 화면비가 그림비와 다르면 잘려 나간다. 그래서 화면의 80%와
 * 그림의 80%가 서로 다른 자리다 — 시계를 화면 기준으로 놓으면 창이 좁아질 때
 * 벽에서 미끄러진다. 같은 `cover` 계산을 다시 해서 그림의 자리를 되찾는다.
 *
 * **`useLayoutEffect`여야 한다.** `useEffect`는 그려진 **뒤**에 도므로 이 층이 새로
 * 붙는 첫 프레임에는 `box`가 아직 null이고, 그러면 **화이트보드와 벽시계가 통째로
 * 빠진 채** 한 번 그려진다. 방에서 가장 밝은 둘이라 화면이 눈에 띄게 어두워졌다가
 * 돌아온다 — 판이 열리는 순간 "잠깐 더 어두워진다"로 잡힌 것이 이것이었다
 * (실측 밝기 49 → 42). 그리기 전에 재면 첫 프레임부터 제자리에 걸려 있다.
 */
function useWallBox(ref: React.RefObject<HTMLDivElement | null>): CSSProperties | null {
  const [box, setBox] = useState<CSSProperties | null>(null)

  useLayoutEffect(() => {
    const node = ref.current
    if (node === null) {
      return
    }
    const art = ARENA_ART['background-day']
    const measure = (): void => {
      const { width, height } = node.getBoundingClientRect()
      if (width === 0 || height === 0) {
        return
      }
      // cover: 짧은 쪽이 꽉 차도록 키운다. 넘치는 쪽은 잘린다
      const scale = Math.max(width / art.width, height / art.height)
      const w = art.width * scale
      const h = art.height * scale
      setBox({
        position: 'absolute',
        // `center bottom` — 가로는 가운데, 세로는 바닥을 맞춘다
        left: (width - w) / 2,
        top: height - h,
        width: w,
        height: h,
        pointerEvents: 'none',
      })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [ref])

  return box
}

/**
 * 벽에 걸린 화이트보드.
 *
 * v1에서는 배경 그림에 박혀 있었고 v2에서 떨어져 나왔다.
 *
 * 여기에 **무엇을 적을지는 아직 정해지지 않았다.** 지금은 그림만 건다 — 떼어내 준
 * 것 자체가 "적는 자리"라는 뜻이지만, 무엇을 적는지는 규칙 쪽이 정할 일이다.
 *
 * ## 자리는 v1 그대로다
 *
 * 중심 (50.5%, 31.7%)에 폭 33.9%. 벽에서 그것이 걸려 있던 자리를 눈이 이미 안다.
 *
 * 한때 탑과 겹치는 것을 피하려고 보드를 위로 올려봤다. 겹침은 사라졌지만 **여기에
 * 곧 읽어야 하는 글자가 적힌다** — 장식이 가려지는 것과 정보가 가려지는 것은 다른
 * 문제라, 보드를 비켜 세우는 것으로는 그때 다시 막힌다. 그래서 판 쪽을 내렸다
 * (`CAMERA_HEADROOM`).
 */
function Whiteboard({
  words,
  activeWords,
  nightfall,
  claim = null,
}: {
  words: readonly string[]
  activeWords: readonly string[]
  nightfall: number
  claim?: WhiteboardClaimNotice | null
}) {
  const { erasedWords, writingWords } = useWhiteboardTransitions(words)
  const active = new Set(activeWords)
  return (
    <div aria-label={words.length === 0 ? '회수 목록 없음' : `회수 목록: ${words.join(', ')}`} style={boardStyle}>
      <div aria-hidden style={fill('whiteboard-day', 1)} />
      <div aria-hidden style={fill('whiteboard-night', nightfall)} />
      <style>{whiteboardAnimationCss}</style>
      <span aria-hidden data-whiteboard-status style={ownerStatusStyle}>주인 찾는 중</span>
      {(words.length > 0 || erasedWords.length > 0) && (
        <div style={wordListStyle}>
          {words.map((word, index) => {
            const writing = writingWords.find((entry) => entry.word === word)
            return (
              <span
                key={word}
                data-whiteboard-word={word}
                data-whiteboard-active={active.has(word) ? 'true' : undefined}
                style={{
                  ...wordStyle,
                  ...scribbleStyle(word, index),
                  opacity: active.has(word) ? 0.9 : 0.44,
                  ...(active.has(word) ? activeWordStyle : null),
                }}
              >
                {active.has(word) && <span aria-hidden style={circleStyle(word, index)} />}
                <span
                  data-whiteboard-writing={writing === undefined ? undefined : 'true'}
                  style={writing === undefined ? undefined : writeWordStyle(writing.delayMs)}
                >
                  {word}
                </span>
              </span>
            )
          })}
          {erasedWords.map((entry) => (
            <span
              key={entry.id}
              aria-hidden
              data-whiteboard-erasing="true"
              style={{
                ...wordStyle,
                ...scribbleStyle(entry.word, entry.index),
                ...eraseWordStyle,
              }}
            >
              <span style={eraseGhostStyle}>{entry.word}</span>
              <span style={eraserSwipeStyle(entry.word, entry.index)} />
            </span>
          ))}
          {claim !== null && (
            <span
              key={claim.seq}
              data-whiteboard-claim={claim.label}
              style={{
                ...wordStyle,
                ...scribbleStyle(claim.word, claim.index),
                zIndex: 4,
                opacity: 1,
              }}
            >
              <span style={whiteboardClaimStyle}>{claim.label}</span>
            </span>
          )}
        </div>
      )}
    </div>
  )
}

type ErasedWord = {
  readonly id: string
  readonly word: string
  readonly index: number
}

type WritingWord = {
  readonly id: string
  readonly word: string
  readonly delayMs: number
}

const ERASE_DURATION_MS = 380
const WRITE_DURATION_MS = 460
const WRITE_AFTER_ERASE_MS = 300
const WRITE_STAGGER_MS = 60

function useWhiteboardTransitions(words: readonly string[]): {
  readonly erasedWords: readonly ErasedWord[]
  readonly writingWords: readonly WritingWord[]
} {
  const previousRef = useRef<readonly string[] | null>(null)
  const nextIdRef = useRef(0)
  const timersRef = useRef<number[]>([])
  const [erasedWords, setErasedWords] = useState<readonly ErasedWord[]>([])
  const [writingWords, setWritingWords] = useState<readonly WritingWord[]>([])

  useLayoutEffect(() => {
    const previous = previousRef.current ?? []
    previousRef.current = words
    const changes = whiteboardWordChanges(previous, words)
    if (changes.removed.length === 0 && changes.added.length === 0) {
      return
    }

    const erased = changes.removed.map((entry) => ({
      ...entry,
      id: `erase-${entry.word}-${nextIdRef.current++}`,
    }))
    const writeLead = erased.length > 0 ? WRITE_AFTER_ERASE_MS : 0
    const writing = changes.added.map((entry, order) => ({
      id: `write-${entry.word}-${nextIdRef.current++}`,
      word: entry.word,
      delayMs: writeLead + order * WRITE_STAGGER_MS,
    }))

    if (erased.length > 0) {
      setErasedWords((current) => [...current, ...erased])
      const eraseTimer = window.setTimeout(() => {
        const ids = new Set(erased.map((entry) => entry.id))
        setErasedWords((current) => current.filter((entry) => !ids.has(entry.id)))
        timersRef.current = timersRef.current.filter((timer) => timer !== eraseTimer)
      }, ERASE_DURATION_MS)
      timersRef.current = [...timersRef.current, eraseTimer]
    }

    if (writing.length > 0) {
      setWritingWords((current) => [...current, ...writing])
      const longestDelay = Math.max(...writing.map((entry) => entry.delayMs))
      const writeTimer = window.setTimeout(() => {
        const ids = new Set(writing.map((entry) => entry.id))
        setWritingWords((current) => current.filter((entry) => !ids.has(entry.id)))
        timersRef.current = timersRef.current.filter((timer) => timer !== writeTimer)
      }, longestDelay + WRITE_DURATION_MS)
      timersRef.current = [...timersRef.current, writeTimer]
    }
  }, [words])

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current) {
        window.clearTimeout(timer)
      }
      timersRef.current = []
    }
  }, [])

  return { erasedWords, writingWords }
}

const BOARD_CENTER_X = 50.5
const BOARD_CENTER_Y = 31.7
/** 글자는 아래의 vw 크기를 유지하고 배경 보드만 줄인다. */
const BOARD_WIDTH = 33.9 * WHITEBOARD_SCALE

const windowLightRootStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  overflow: 'hidden',
}

const windowLightAnimationCss = `
@keyframes window-sunbeam-drift {
  0% { transform: rotate(18deg) translate3d(-1.2%, -0.4%, 0); }
  50% { transform: rotate(18deg) translate3d(1.4%, 0.8%, 0); }
  100% { transform: rotate(18deg) translate3d(-1.2%, -0.4%, 0); }
}

@keyframes window-motes-float {
  0% { background-position: 0% 0%, 35% 70%, 78% 28%; transform: translate3d(-0.6%, 1.2%, 0); }
  50% { background-position: 28% 36%, 62% 48%, 94% 62%; transform: translate3d(1%, -0.8%, 0); }
  100% { background-position: 0% 0%, 35% 70%, 78% 28%; transform: translate3d(-0.6%, 1.2%, 0); }
}

@media (prefers-reduced-motion: reduce) {
  [data-window-ray],
  [data-window-wash],
  [data-window-motes],
  [data-window-glow] {
    animation: none !important;
  }
}
`

function windowBeamStyle(tone: 'day' | 'night', alpha: number): CSSProperties {
  const day = tone === 'day'
  return {
    position: 'absolute',
    left: '17.5%',
    top: day ? '31%' : '30%',
    width: day ? '31%' : '28%',
    height: day ? '45%' : '40%',
    transform: 'skewX(-18deg) rotate(7deg)',
    transformOrigin: '0 0',
    background: day
      ? 'radial-gradient(ellipse at 0% 18%, rgba(255, 236, 142, 0.32), rgba(255, 218, 111, 0.12) 38%, rgba(255, 207, 99, 0) 72%)'
      : 'linear-gradient(104deg, rgba(141, 185, 255, 0.28) 0%, rgba(129, 136, 255, 0.16) 42%, rgba(107, 105, 228, 0.05) 76%, rgba(107, 105, 228, 0) 100%)',
    filter: day ? 'blur(12px)' : 'blur(8px)',
    opacity: day ? alpha * 0.68 : alpha * 0.58,
    mixBlendMode: 'screen',
  }
}

function windowWashStyle(alpha: number): CSSProperties {
  return {
    position: 'absolute',
    left: '7.5%',
    top: '22%',
    width: '48%',
    height: '55%',
    background:
      'radial-gradient(ellipse at 0% 18%, rgba(255, 244, 173, 0.42), rgba(255, 230, 137, 0.2) 34%, rgba(255, 221, 115, 0.08) 58%, rgba(255, 221, 115, 0) 78%)',
    filter: 'blur(14px)',
    opacity: alpha * 0.74,
    mixBlendMode: 'screen',
    transform: 'rotate(18deg)',
    transformOrigin: 'left center',
  }
}

function windowRayStyle(index: 0 | 1 | 2, alpha: number): CSSProperties {
  const rays = [
    { left: '12%', top: '28%', width: '43%', height: '4.6%', rotate: 18, opacity: 0.86, delay: '0s' },
    { left: '11%', top: '36%', width: '49%', height: '3.8%', rotate: 21, opacity: 0.68, delay: '-2.2s' },
    { left: '14%', top: '45%', width: '38%', height: '3.1%', rotate: 24, opacity: 0.52, delay: '-4.1s' },
  ] as const
  const ray = rays[index]
  return {
    position: 'absolute',
    left: ray.left,
    top: ray.top,
    width: ray.width,
    height: ray.height,
    transform: `rotate(${ray.rotate}deg)`,
    transformOrigin: 'left center',
    background:
      'linear-gradient(90deg, rgba(255, 252, 210, 0.82), rgba(255, 235, 153, 0.42) 46%, rgba(255, 231, 145, 0.12) 72%, rgba(255, 231, 145, 0))',
    borderRadius: '999px',
    filter: 'blur(4px)',
    opacity: alpha * ray.opacity,
    mixBlendMode: 'screen',
    animation: 'window-sunbeam-drift 8.5s ease-in-out infinite',
    animationDelay: ray.delay,
  }
}

function windowGlowStyle(alpha: number): CSSProperties {
  return {
    position: 'absolute',
    left: '5.2%',
    top: '14.5%',
    width: '26%',
    height: '39%',
    background:
      'radial-gradient(ellipse at 46% 42%, rgba(255, 251, 197, 0.34), rgba(255, 232, 136, 0.18) 42%, rgba(255, 211, 97, 0.04) 74%, rgba(255, 211, 97, 0) 100%)',
    filter: 'blur(3px)',
    opacity: alpha * 0.86,
    mixBlendMode: 'screen',
    animation: 'window-sunbeam-drift 10s ease-in-out infinite',
  }
}

function windowMotesStyle(alpha: number): CSSProperties {
  return {
    position: 'absolute',
    left: '18%',
    top: '36%',
    width: '34%',
    height: '43%',
    background:
      'radial-gradient(circle at 16% 20%, rgba(255, 252, 211, 0.72) 0 1.4px, transparent 2.8px), radial-gradient(circle at 48% 68%, rgba(255, 238, 170, 0.58) 0 1.2px, transparent 2.7px), radial-gradient(circle at 76% 34%, rgba(255, 249, 218, 0.5) 0 1.1px, transparent 2.6px)',
    backgroundSize: '76px 68px, 104px 88px, 132px 112px',
    clipPath: 'polygon(0 0, 100% 36%, 84% 100%, 0 66%)',
    filter: 'blur(0.4px)',
    opacity: alpha * 0.88,
    mixBlendMode: 'screen',
    animation: 'window-motes-float 12s ease-in-out infinite',
  }
}

function windowPoolStyle(tone: 'day' | 'night', alpha: number): CSSProperties {
  const day = tone === 'day'
  return {
    position: 'absolute',
    left: day ? '22%' : '24%',
    top: day ? '75%' : '76%',
    width: day ? '32%' : '28%',
    height: day ? '12%' : '10%',
    transform: 'skewX(-18deg) rotate(-2deg)',
    background: day
      ? 'radial-gradient(ellipse at 36% 50%, rgba(255, 232, 150, 0.46), rgba(255, 201, 92, 0.16) 48%, rgba(255, 201, 92, 0) 76%)'
      : 'radial-gradient(ellipse at 36% 50%, rgba(157, 191, 255, 0.26), rgba(128, 122, 255, 0.1) 50%, rgba(128, 122, 255, 0) 78%)',
    filter: day ? 'blur(5px)' : 'blur(7px)',
    opacity: day ? alpha : alpha * 0.52,
    mixBlendMode: 'screen',
  }
}

const boardStyle: CSSProperties = {
  position: 'absolute',
  left: `${BOARD_CENTER_X - BOARD_WIDTH / 2}%`,
  width: `${BOARD_WIDTH}%`,
  aspectRatio: `${ARENA_ART['whiteboard-day'].width / ARENA_ART['whiteboard-day'].height}`,
  top: `${BOARD_CENTER_Y}%`,
  transform: 'translateY(-50%)',
}

const wordListStyle: CSSProperties = {
  position: 'absolute',
  left: '7%',
  right: '7%',
  top: '16%',
  bottom: '18%',
}

const WHITEBOARD_FONT = '"GriunXHangeul A Foreign Hand", "Apple SD Gothic Neo", "Malgun Gothic", cursive'
const WHITEBOARD_WORD_SIZE = 35

const ownerStatusStyle: CSSProperties = {
  position: 'absolute',
  left: '10%',
  top: '10%',
  color: '#000',
  fontFamily: WHITEBOARD_FONT,
  fontSize: WHITEBOARD_WORD_SIZE * 0.7,
  fontWeight: 400,
  lineHeight: 1,
  letterSpacing: '0.02em',
}

const wordStyle: CSSProperties = {
  position: 'absolute',
  display: 'block',
  color: '#1f2d29',
  fontFamily: WHITEBOARD_FONT,
  fontWeight: 400,
  lineHeight: 1,
  letterSpacing: '0.02em',
  textAlign: 'center',
  textShadow: '0 0 1px rgba(255, 255, 255, 0.28)',
  filter: 'blur(0.15px)',
}

const activeWordStyle: CSSProperties = {
  color: '#172621',
  textShadow: '0 0 1px rgba(255, 255, 255, 0.34), 0 0 5px rgba(31, 45, 41, 0.18)',
  filter: 'blur(0.05px)',
  animation: 'whiteboard-active-breathe 900ms ease-in-out infinite',
}

const eraseWordStyle: CSSProperties = {
  opacity: 0.32,
  animation: `whiteboard-erase-word ${ERASE_DURATION_MS}ms cubic-bezier(0.23, 1, 0.32, 1) forwards`,
}

const eraseGhostStyle: CSSProperties = {
  position: 'relative',
  zIndex: 1,
}

const whiteboardClaimStyle: CSSProperties = {
  display: 'inline-block',
  color: '#713f4b',
  fontSize: 22,
  fontWeight: 700,
  whiteSpace: 'nowrap',
  textShadow: '0 0 1px rgba(255, 255, 255, 0.45)',
  animation: 'whiteboard-claim-owner 1800ms cubic-bezier(0.2, 0.8, 0.3, 1) forwards',
}

function writeWordStyle(delayMs: number): CSSProperties {
  return {
    display: 'inline-block',
    animation: `whiteboard-write-word ${WRITE_DURATION_MS}ms cubic-bezier(0.23, 1, 0.32, 1) ${delayMs}ms both`,
  }
}

const whiteboardAnimationCss = `
@keyframes whiteboard-erase-word {
  0% { opacity: 0.34; filter: blur(0.15px); }
  42% { opacity: 0.2; filter: blur(0.5px); }
  100% { opacity: 0; filter: blur(1.1px); }
}

@keyframes whiteboard-eraser-swipe {
  0% { opacity: 0; transform: translate(-74%, -50%) rotate(var(--erase-rotation)) scaleX(0.34); }
  18% { opacity: 0.52; }
  100% { opacity: 0; transform: translate(36%, -50%) rotate(var(--erase-rotation)) scaleX(1.16); }
}

@keyframes whiteboard-write-word {
  0% {
    opacity: 0;
    clip-path: inset(-0.18em 100% -0.18em 0);
    filter: blur(0.8px);
  }
  24% { opacity: 0.58; }
  100% {
    opacity: 1;
    clip-path: inset(-0.18em 0 -0.18em 0);
    filter: blur(0);
  }
}

@keyframes whiteboard-circle-draw {
  0% {
    opacity: 0;
    clip-path: polygon(50% 50%, 50% 50%, 50% 50%, 50% 50%);
    transform: translate(-50%, -50%) rotate(var(--circle-rotation)) scale(0.92);
  }
  35% {
    opacity: 0.22;
    clip-path: polygon(50% 0%, 100% 0%, 100% 54%, 50% 54%);
  }
  70% {
    opacity: 0.36;
    clip-path: polygon(50% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 48%);
  }
  100% {
    opacity: 1;
    clip-path: polygon(50% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%);
    transform: translate(-50%, -50%) rotate(var(--circle-rotation)) scale(1);
  }
}

@keyframes whiteboard-active-breathe {
  0%, 100% { filter: blur(0.05px); }
  50% { filter: blur(0) drop-shadow(0 0 2px rgba(31, 45, 41, 0.28)); }
}

@keyframes whiteboard-claim-owner {
  0% { opacity: 0; transform: translateY(5px) scale(0.92); }
  18% { opacity: 0.94; transform: translateY(0) scale(1); }
  72% { opacity: 0.94; transform: translateY(-2px) scale(1); }
  100% { opacity: 0; transform: translateY(-9px) scale(0.96); }
}

@media (prefers-reduced-motion: reduce) {
  [data-whiteboard-writing='true'] { animation: none !important; }
  [data-whiteboard-erasing='true'] { display: none !important; }
}
`

function eraserSwipeStyle(word: string, index: number): CSSProperties {
  const seed = hashText(word) + index * 307
  const rotation = -5 + jitter(seed, 7) * 10
  return {
    '--erase-rotation': `${rotation}deg`,
    position: 'absolute',
    zIndex: 2,
    left: '50%',
    top: '52%',
    width: 'calc(100% + 30px)',
    height: '1.15em',
    borderRadius: '45% 52% 48% 46%',
    background:
      'linear-gradient(90deg, rgba(228, 231, 219, 0), rgba(228, 231, 219, 0.62) 28%, rgba(232, 234, 224, 0.72) 56%, rgba(228, 231, 219, 0))',
    boxShadow: '0 0 5px rgba(225, 228, 218, 0.42)',
    filter: 'blur(1.1px)',
    pointerEvents: 'none',
    animation: `whiteboard-eraser-swipe ${ERASE_DURATION_MS}ms cubic-bezier(0.23, 1, 0.32, 1) forwards`,
  } as CSSProperties
}

function circleStyle(word: string, index: number): CSSProperties {
  const seed = hashText(word) + index * 211
  const rotation = -7 + jitter(seed, 6) * 14
  return {
    '--circle-rotation': `${rotation}deg`,
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 'calc(100% + 22px)',
    height: 'calc(100% + 12px)',
    transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
    border: '3px solid rgba(31, 45, 41, 0.58)',
    borderRadius: '48% 54% 51% 46% / 56% 44% 52% 48%',
    boxShadow: 'inset 0 0 0 1px rgba(43, 57, 51, 0.14), 0 0 4px rgba(31, 45, 41, 0.16)',
    pointerEvents: 'none',
    animation: 'whiteboard-circle-draw 520ms cubic-bezier(0.22, 0.74, 0.24, 1) both',
  } as CSSProperties
}

function scribbleStyle(word: string, index: number): CSSProperties {
  const seed = hashText(word) + index * 101
  const anchors = [
    { x: 47, y: 18 },
    { x: 53, y: 42 },
    { x: 50, y: 72 },
  ] as const
  const anchor = anchors[index % anchors.length]!
  /* 보드만 줄였으므로 긴 단어도 테두리 안에 남게 가로 흔들림은 중앙 근처로 묶는다. */
  const x = anchor.x + (jitter(seed, 0) - 0.5) * 6
  const y = anchor.y + (jitter(seed, 1) - 0.5) * 16
  const rotation = -8 + jitter(seed, 2) * 16
  const stretch = 0.94 + jitter(seed, 4) * 0.12
  return {
    left: `${x}%`,
    top: `${y}%`,
    fontSize: WHITEBOARD_WORD_SIZE,
    transform: `translate(-50%, -50%) rotate(${rotation}deg) scaleX(${stretch})`,
  }
}

function hashText(text: string): number {
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function jitter(seed: number, salt: number): number {
  let value = (seed + Math.imul(salt + 1, 0x9e3779b9)) >>> 0
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b)
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35)
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296
}

function fill(name: 'whiteboard-day' | 'whiteboard-night', alpha: number): CSSProperties {
  return {
    position: 'absolute',
    inset: 0,
    backgroundImage: `url(${import.meta.env.BASE_URL}arena/${ARENA_ART[name].file})`,
    backgroundSize: 'contain',
    backgroundRepeat: 'no-repeat',
    opacity: alpha,
  }
}

const rootStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  overflow: 'hidden',
  // 캔버스와 레인보다 뒤에 있어야 한다. 뒤에 두는 것만이 이 층이 하는 일이다
  zIndex: 0,
  pointerEvents: 'none',
}

function layerStyle(name: 'background-day' | 'background-night', alpha: number): CSSProperties {
  return {
    position: 'absolute',
    inset: 0,
    backgroundImage: `url(${import.meta.env.BASE_URL}arena/${ARENA_ART[name].file})`,
    /*
     * `cover`로 채운다. 화면비가 그림비(2:1)와 다를 때 여백을 남기지 않으려는 것이고,
     * 잘리는 쪽은 위아래다 — 그림의 좌우 끝(책장·서류함)이 잘리면 방이 좁아 보인다.
     */
    backgroundSize: 'cover',
    backgroundPosition: 'center bottom',
    opacity: alpha,
  }
}

/*
 * **그림을 덮지 않는다.**
 *
 * 한때 여기에 어두운 막을 한 겹 깔았다. 낮 배경이 밝기 149로 지금까지의 단색
 * 배경(15)보다 열 배 밝아서, 가산 합성으로 칠하는 연출(얹힌 색·부스러기)이 그
 * 위에서는 아무것도 하지 못하기 때문이다 — 밝은 바탕에 빛을 더해봐야 보이지 않는다.
 *
 * 막은 그 문제를 **그림을 죽여서** 풀었다. 갈아끼운 뜻이 절반 사라지는 값이라
 * 걷어냈다. 밝은 바탕에서 연출이 보이게 하는 것은 연출 쪽이 풀 문제다 —
 * 낮에는 빛을 더하는 대신 그늘을 지우는 방향으로 가야 한다.
 */

export { ArenaBackdrop, Whiteboard }
export type { WhiteboardClaimNotice }
