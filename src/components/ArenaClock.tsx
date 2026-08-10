import type { CSSProperties } from 'react'
import { ARENA_ART } from '../game/renderer/arenaArt.generated.ts'
import type { TimeOfDay } from '../game/systems/DayNight.ts'
import { cycleOf } from '../game/systems/DayNight.ts'

interface ArenaClockProps {
  time: TimeOfDay
}

/**
 * 벽에 걸린 시계. **한 주기가 한 바퀴다.**
 *
 * 배경에 그려져 있던 시계가 새 아트에서 빠지고 판·바늘·아이콘 세 장으로 왔다.
 * 그래서 이제 벽의 시계는 **실제로 돈다** — 방의 물건 하나가 규칙을 말하는 계기판이
 * 된다. 어두워지는 것과 바늘이 밤 구간에 든 것이 같은 사실의 두 얼굴이다.
 *
 * ## 왜 국면 진행도로 돌리지 않는가
 *
 * `TimeOfDay.progress`는 **국면 안의** 값이라 낮이 끝나면 0으로 되돌아간다. 그것으로
 * 돌리면 바늘이 하루에 두 번 튄다. 한 바퀴가 한 주기이려면 주기 안의 자리가
 * 필요하고, 그것을 `cycleOf`가 준다.
 *
 * 낮 30초 · 밤 15초라 **낮이 눈금판의 3분의 2를 차지한다.** 등속이므로 바늘이
 * 빨라지거나 느려지지 않는다 — 눈금판에 숫자가 없어서 어색하지 않고, 오히려
 * "밤은 짧다"가 각도로 읽힌다.
 */
function ArenaClock({ time }: ArenaClockProps) {
  const angle = cycleOf(time) * 360
  return (
    <div aria-hidden style={rootStyle}>
      <div style={layer('timer-dial-day', 1)} />
      <div style={layer('timer-dial-night', time.nightfall)} />
      <div style={handStyle(angle)}>
        <div style={layer('timer-hand-day', 1)} />
        <div style={layer('timer-hand-night', time.nightfall)} />
      </div>
      {/*
        아이콘만 **겹쳐 쌓지 않고 갈아탄다.**

        눈금판과 바늘은 낮/밤 그림이 같은 구도라 밤을 위에 얹는 것으로 충분하다
        (`ArenaBackdrop`과 같은 어법). 아이콘은 해와 초승달로 **모양이 아예 다르다** —
        달을 얹어도 해의 광선이 달 밖으로 삐져나와 둘이 함께 보인다.
      */}
      <div style={iconStyle}>
        <div style={layer('timer-icon-day', 1 - time.nightfall)} />
        <div style={layer('timer-icon-night', time.nightfall)} />
      </div>
    </div>
  )
}

/**
 * 시계가 걸리는 자리. 배경 그림 기준 비율이다.
 *
 * v1 배경에 그려져 있던 시계를 재서 옮겼다(중심 81.5%, 26.6% · 지름 11.6%).
 * 벽에서 시계가 걸려 있던 자리를 눈이 이미 알고 있으므로 그 자리를 지킨다.
 */
const CENTER_X = 81.5
const CENTER_Y = 26.6
const DIAMETER = 11.6

const rootStyle: CSSProperties = {
  position: 'absolute',
  left: `${CENTER_X - DIAMETER / 2}%`,
  top: `${CENTER_Y - DIAMETER / 2}%`,
  width: `${DIAMETER}%`,
  // 판이 원이라 그림 비율을 그대로 쓴다
  aspectRatio: `${ARENA_ART['timer-dial-day'].width / ARENA_ART['timer-dial-day'].height}`,
  pointerEvents: 'none',
}

/**
 * 바늘의 **축을 판 중심에 앉힌다.**
 *
 * 그림에서 재보니 판의 중심은 49.8%인데 바늘의 허브는 75.2%였다 — 같은 캔버스에
 * 그려져 있지만 겹쳐만 두면 바늘이 판 아래에 매달린다. 허브를 회전축으로 삼고
 * 그 차이만큼 끌어올려야 제자리에서 돈다.
 *
 * 끌어올리는 양은 **그림 높이 기준**이라 화면 크기가 바뀌어도 따라온다.
 */
const HAND_PIVOT_X = 49.7
const HAND_PIVOT_Y = 75.2
const DIAL_CENTER = 49.8

/**
 * 바늘을 이만큼 줄인다. **줄이지 않으면 판 밖으로 나간다.**
 *
 * 그림의 바늘은 허브(75.2%)에서 끝(12.2%)까지 63%인데 판의 반지름은 49.85%다 —
 * 축을 판 중심으로 옮기는 순간 끝이 13.1%만큼 삐져나온다. 그림에서는 허브가 아래에
 * 있어 그 길이가 캔버스 안에 들어갔지만, 가운데로 옮기면 사정이 달라진다.
 *
 * 끝을 반지름의 **78%**에 둔다(= 63% × 0.617 ≈ 38.9%). 눈금까지 닿으면 어느 눈금을
 * 가리키는지 오히려 헷갈리고, 너무 짧으면 무엇을 가리키는지 안 보인다.
 */
const HAND_SCALE = 0.617

function handStyle(angle: number): CSSProperties {
  return {
    position: 'absolute',
    left: 0,
    top: `${DIAL_CENTER - HAND_PIVOT_Y}%`,
    width: '100%',
    height: '100%',
    transformOrigin: `${HAND_PIVOT_X}% ${HAND_PIVOT_Y}%`,
    // 둘 다 허브를 축으로 돈다 — 줄여도 축은 판 중심에 그대로 머문다
    transform: `rotate(${angle}deg) scale(${HAND_SCALE})`,
  }
}

/**
 * 해와 달. 시계 **위**에 건다.
 *
 * v1 배경에서도 시계 바로 위에 있었다. 눈금판 안에 넣으면 바늘과 겹쳐 둘 다 읽기
 * 어려워진다 — 아이콘은 "지금 낮인가 밤인가"를 한눈에 말하는 것이고, 바늘은
 * "얼마나 왔는가"를 말한다. 서로 다른 일이라 자리도 나눈다.
 */
const iconStyle: CSSProperties = {
  position: 'absolute',
  // 원래 크기의 절반으로 줄인 뒤 중심은 시계 축에 그대로 맞춘다
  left: '37.5%',
  // 눈금판에 붙어 보이지 않도록 시계 지름의 8%만큼 띄운다
  bottom: '108%',
  width: '25%',
  aspectRatio: '1',
}

function layer(name: keyof typeof ARENA_ART, alpha: number): CSSProperties {
  return {
    position: 'absolute',
    inset: 0,
    backgroundImage: `url(${import.meta.env.BASE_URL}arena/${ARENA_ART[name].file})`,
    backgroundSize: 'contain',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center',
    opacity: alpha,
  }
}

export { ArenaClock }
