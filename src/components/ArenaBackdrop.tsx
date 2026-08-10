import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { ARENA_ART } from '../game/renderer/arenaArt.generated.ts'
import { ArenaClock } from './ArenaClock.tsx'
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
    return <BackdropLayers nightfall={props.nightfall} />
  }
  return (
    <SoloArenaBackdrop
      time={props.time}
      whiteboard={props.whiteboard ?? []}
      activeWhiteboard={props.activeWhiteboard ?? []}
    />
  )
}

/** 대전은 방만 쓴다. 판의 규칙이 없는 화이트보드와 국면 시계는 그리지 않는다. */
function BackdropLayers({ nightfall }: { nightfall: number }) {
  return (
    <div aria-hidden style={rootStyle}>
      <div style={layerStyle('background-day', 1)} />
      <div style={layerStyle('background-night', nightfall)} />
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
          <Whiteboard words={whiteboard} activeWords={activeWhiteboard} nightfall={time.nightfall} />
          <ArenaClock time={time} />
        </div>
      )}
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
}: {
  words: readonly string[]
  activeWords: readonly string[]
  nightfall: number
}) {
  const active = new Set(activeWords)
  return (
    <div aria-label={words.length === 0 ? '회수 목록 없음' : `회수 목록: ${words.join(', ')}`} style={boardStyle}>
      <div aria-hidden style={fill('whiteboard-day', 1)} />
      <div aria-hidden style={fill('whiteboard-night', nightfall)} />
      {words.length > 0 && (
        <div style={wordListStyle}>
          {words.map((word) => (
            <span
              key={word}
              data-whiteboard-word={word}
              data-whiteboard-active={active.has(word) ? 'true' : undefined}
              style={{
                ...wordStyle,
                opacity: active.has(word) ? 0.64 : 0.34,
                borderBottom: active.has(word) ? '1px solid rgba(43, 57, 51, 0.28)' : '1px solid transparent',
              }}
            >
              {word}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

const BOARD_CENTER_X = 50.5
const BOARD_CENTER_Y = 31.7
const BOARD_WIDTH = 33.9

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
  left: '14%',
  right: '14%',
  top: '28%',
  bottom: '16%',
  display: 'grid',
  gridTemplateRows: 'repeat(3, minmax(0, 1fr))',
  alignItems: 'center',
  transform: 'rotate(-1.6deg)',
}

const wordStyle: CSSProperties = {
  position: 'relative',
  display: 'block',
  color: '#2b3933',
  fontSize: 'clamp(12px, 1.15vw, 21px)',
  fontWeight: 600,
  lineHeight: 1,
  letterSpacing: '0.01em',
  textAlign: 'center',
  textShadow: '0 0 1px rgba(255, 255, 255, 0.28)',
  filter: 'blur(0.15px)',
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

export { ArenaBackdrop }
