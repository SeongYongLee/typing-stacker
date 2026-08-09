import { useEffect, useRef, type CSSProperties } from 'react'
import { WORD } from '../game/config.ts'
import type { FallingWord, Side } from '../game/types/game.ts'
import { play } from './animate.ts'
import { PAIR_MARK_COLORS } from '../game/systems/PairMarks.ts'

interface TypingLaneProps {
  words: readonly FallingWord[]
  side: Side
  /**
   * 단어를 놓친 횟수. 이 값이 오를 때마다 바닥선이 붉게 번진다.
   *
   * 놓치면 정확도가 떨어져 점수가 깎이는데, 그 일은 화면 반대쪽(입력줄 옆 숫자)에서
   * 일어난다. 정작 놓친 자리는 이 선이므로 여기서도 한 번 알린다.
   */
  missSeq?: number
  /**
   * 이 단어가 받침대의 무엇과 붙는지. 단어 → 표식 번호.
   *
   * 받침대의 물건에도 같은 번호로 같은 모양이 그려져서, 같은 모양끼리 붙이면 합쳐진다.
   * 대전은 합성이 없으므로 넘기지 않는다.
   */
  wordMarks?: ReadonlyMap<string, number>
  /**
   * 짝 표식의 밝기(0~1). 엔진이 계산한 값을 그대로 받는다.
   *
   * 칩이 스스로 시계를 돌리지 않는 이유는 **받침대의 물건과 같은 순간에 빛나야** 하기
   * 때문이다. 각자 켜지면 칩마다 시작 시각이 달라 위상이 제각각이 된다.
   */
  pairPulse?: number
}


/*
 * 낙하 단어는 **보관소의 쪽지**다.
 *
 * 예전에는 짙은 남색 칩에 흰 글씨였다. 배경이 단색일 때는 배경에 얹힌 표였는데,
 * 방을 그린 그림 위에서는 검은 상자가 방 안을 떠다니는 것으로 보인다.
 *
 * 종이를 고른 이유는 방과 어울려서만이 아니다. **낮에도 밤에도 읽힌다** — 밝은
 * 벽(밝기 149)에서도 어두운 밤(54)에서도 크림색 종이는 바탕과 갈라진다. 짙은 칩은
 * 밤에 벽으로 녹아들었고 흰 글씨는 낮에 흐려졌다. 화이트보드에 이미 쪽지가 붙어
 * 있으므로 "여기 적힌 것"이라는 뜻도 설명 없이 읽힌다.
 */
const PAPER = '#f0e6cd'
const PAPER_EDGE = '#c8b795'
const INK = '#2f2718'
/** 놓친 쪽지는 색이 바래고 글씨가 옅어진다 */
const PAPER_MISSED = 'rgba(240, 230, 205, 0.34)'
const INK_MISSED = '#7a6e57'

/** 레인 바닥선. 밝은 바닥에서도 어두운 밤에서도 같은 세기로 보이는 중간 온도 */
const LANE_LINE = 'rgba(120, 104, 78, 0.55)'
const MISS_FLASH = '#ff6b6b'

const laneStyle: CSSProperties = {
  position: 'relative',
  height: '100%',
  minWidth: 0,
  borderBottom: `2px dashed ${LANE_LINE}`,
}

const chipBase: CSSProperties = {
  position: 'absolute',
  transform: 'translate(-50%, -50%)',
  padding: '6px 12px',
  borderRadius: 8,
  fontSize: 21,
  fontWeight: 600,
  letterSpacing: '0.02em',
  whiteSpace: 'nowrap',
  border: '1px solid',
}

const NO_MARKS: ReadonlyMap<string, number> = new Map()

/** 16진 색에 투명도를 얹는다. 밝기를 색 자체에 실어야 어두울 때 배경에 녹는다 */
function alpha(color: string, amount: number): string {
  const hex = Math.round(Math.min(Math.max(amount, 0), 1) * 255)
    .toString(16)
    .padStart(2, '0')
  return `${color}${hex}`
}

function TypingLane({
  words,
  side,
  missSeq = 0,
  wordMarks = NO_MARKS,
  pairPulse = 1,
}: TypingLaneProps) {
  const mine = words.filter((word) => word.side === side)
  const laneRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (missSeq === 0) {
      return
    }
    play(
      laneRef.current,
      [
        { borderBottomColor: MISS_FLASH, borderBottomWidth: '3px' },
        { borderBottomColor: MISS_FLASH, borderBottomWidth: '3px', offset: 0.35 },
        { borderBottomColor: LANE_LINE, borderBottomWidth: '2px' },
      ],
      { duration: 620, easing: 'ease-out' },
    )
  }, [missSeq])

  return (
    <div ref={laneRef} style={laneStyle} data-lane={side}>
      {mine.map((word) => (
        <Chip key={word.id} word={word} mark={wordMarks.get(word.word)} pulse={pairPulse} />
      ))}
    </div>
  )
}

function Chip({
  word,
  mark,
  pulse,
}: {
  word: FallingWord
  mark: number | undefined
  pulse: number
}) {
  const missed = word.state === 'missed'
  // 놓친 단어에는 붙이지 않는다 — 이미 칠 수 없는 것에 "붙일 수 있다"고 알리는 셈이다
  const paired = mark !== undefined && !missed
  const color = paired ? (PAIR_MARK_COLORS[mark % PAIR_MARK_COLORS.length] ?? null) : null

  return (
    <div
      data-word={word.word}
      data-state={word.state}
      data-pair-mark={paired ? mark : undefined}
      style={{
        ...chipBase,
        top: `${word.y * 100}%`,
        left: `${((word.slot + 0.5) / WORD.slotsPerSide) * 100}%`,
        opacity: missed ? word.fade * 0.6 : 1,
        color: missed ? INK_MISSED : INK,
        background: missed ? PAPER_MISSED : PAPER,
        /*
         * 짝이 있으면 테두리가 그 짝의 색으로 바뀐다. 받침대의 물건에는 같은 색
         * 동그라미가 둘린다 — 색이 둘을 잇는다(까닭은 `systems/PairMarks.ts`에).
         */
        borderColor: color ?? (missed ? 'rgba(160, 146, 118, 0.4)' : PAPER_EDGE),
        /*
         * 숨 쉬듯 빛난다. 밝기는 엔진이 준 값이라 받침대의 물건과 **같은 순간**에 밝다.
         * CSS 애니메이션을 쓰지 않는 것은 이 칩이 매 프레임 다시 그려지기 때문이고,
         * 값으로 그리면 그 다시 그리는 일에 그냥 얹힌다.
         */
        boxShadow: color === null ? 'none' : `0 0 ${4 + pulse * 10}px ${alpha(color, pulse)}`,
        borderWidth: paired ? 2 : 1,
        textDecoration: missed ? 'line-through' : 'none',
      }}
    >
      {word.word}
    </div>
  )
}

export { TypingLane }
