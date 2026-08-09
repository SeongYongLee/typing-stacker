import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ARENA_ART } from '../game/renderer/arenaArt.generated.ts'
import { ArenaClock } from './ArenaClock.tsx'
import type { TimeOfDay } from '../game/systems/DayNight.ts'

interface ArenaBackdropProps {
  /** 지금 몇 시인가. 조명과 벽시계가 이것을 따라간다 */
  time: TimeOfDay
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
function ArenaBackdrop({ time }: ArenaBackdropProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const wall = useWallBox(rootRef)
  return (
    <div ref={rootRef} aria-hidden style={rootStyle}>
      <div style={layerStyle('background-day', 1)} />
      <div style={layerStyle('background-night', time.nightfall)} />
      {/*
        벽에 거는 것들은 **그림에 붙어야** 한다. 화면이 아니라 방의 좌표다 —
        창문 옆 그 자리에 걸린 것이지 화면 오른쪽 위에 떠 있는 것이 아니다.
      */}
      {wall !== null && (
        <div style={wall}>
          <Whiteboard nightfall={time.nightfall} />
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
 */
function useWallBox(ref: React.RefObject<HTMLDivElement | null>): CSSProperties | null {
  const [box, setBox] = useState<CSSProperties | null>(null)

  useEffect(() => {
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
function Whiteboard({ nightfall }: { nightfall: number }) {
  return (
    <div aria-hidden style={boardStyle}>
      <div style={fill('whiteboard-day', 1)} />
      <div style={fill('whiteboard-night', nightfall)} />
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
