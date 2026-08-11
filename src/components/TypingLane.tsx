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
   * 대결에서는 각자 자기 판에 있는 물건을 기준으로 표식을 넘긴다.
   */
  wordMarks?: ReadonlyMap<string, number>
  /** 합성 가능한 단어 → 지금 받침대에서 붙일 짝 물건의 이미지 URL. */
  mergeHints?: ReadonlyMap<string, readonly string[]>
  /**
   * 짝 표식의 밝기(0~1). 엔진이 계산한 값을 그대로 받는다.
   *
   * 칩이 스스로 시계를 돌리지 않는 이유는 **받침대의 물건과 같은 순간에 빛나야** 하기
   * 때문이다. 각자 켜지면 칩마다 시작 시각이 달라 위상이 제각각이 된다.
   */
  pairPulse?: number
  /** 화이트보드에 적힌 단어. 이 단어는 치면 쌓지 않고 회수된다. */
  recallWords?: readonly string[]
  /** 화이트보드 연결 단어에 붙일 모드별 안내. 싱글은 회수 손, 대결은 생명 하트다. */
  recallMarker?: 'hand' | 'heart'
  /** 대결에서 방금 사라진 단어의 자리에 남기는 획득 안내. */
  claims?: readonly WordClaimNotice[]
}

interface WordClaimNotice {
  readonly seq: number
  readonly side: Side
  readonly slot: number
  readonly y: number
  readonly label: string
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
const RECALL_PAPER = '#edf0df'
const RECALL_INK = '#28362f'

const laneStyle: CSSProperties = {
  position: 'relative',
  height: '100%',
  minWidth: 0,
  borderBottom: `2px dashed ${LANE_LINE}`,
}

const chipBase: CSSProperties = {
  position: 'absolute',
  padding: '6px 12px',
  borderRadius: 8,
  fontFamily: '"GriunXHangeul A Foreign Hand", "Apple SD Gothic Neo", "Malgun Gothic", cursive',
  fontSize: 35,
  fontWeight: 400,
  lineHeight: 1,
  letterSpacing: '0.02em',
  whiteSpace: 'nowrap',
  border: '1px solid',
}

const NO_MARKS: ReadonlyMap<string, number> = new Map()
const NO_MERGE_HINTS: ReadonlyMap<string, readonly string[]> = new Map()

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
  mergeHints = NO_MERGE_HINTS,
  pairPulse = 1,
  recallWords = [],
  recallMarker,
  claims = [],
}: TypingLaneProps) {
  const mine = words.filter((word) => word.side === side)
  const recallSet = new Set(recallWords)
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
        <Chip
          key={word.id}
          word={word}
          mark={wordMarks.get(word.word)}
          mergeHint={mergeHints.get(word.word)}
          pulse={pairPulse}
          recall={recallSet.has(word.word)}
          recallMarker={recallMarker}
        />
      ))}
      {claims.filter((claim) => claim.side === side).map((claim) => (
        <ClaimMarker key={claim.seq} claim={claim} />
      ))}
    </div>
  )
}

function ClaimMarker({ claim }: { claim: WordClaimNotice }) {
  const ref = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    const animation = play(
      ref.current,
      [
        { transform: 'translateY(4px) scale(0.9)', opacity: 0 },
        { transform: 'translateY(0) scale(1)', opacity: 1, offset: 0.2 },
        { transform: 'translateY(-4px) scale(1)', opacity: 1, offset: 0.68 },
        { transform: 'translateY(-12px) scale(0.96)', opacity: 0 },
      ],
      { duration: 1300, easing: 'cubic-bezier(0.22, 0.8, 0.32, 1)' },
    )
    return () => animation?.cancel()
  }, [claim.seq])

  return (
    <div
      data-word-claim={claim.label}
      style={{
        position: 'absolute',
        top: `${claim.y * 100}%`,
        left: `${((claim.slot + 0.5) / WORD.slotsPerSide) * 100}%`,
        transform: `translate(-50%, ${-claim.y * 100}%)`,
        zIndex: 2,
        pointerEvents: 'none',
      }}
    >
      <span
        ref={ref}
        style={{
          display: 'block',
          color: '#fff4cb',
          fontSize: 16,
          fontWeight: 800,
          lineHeight: 1,
          whiteSpace: 'nowrap',
          opacity: 0,
          textShadow: '0 2px 1px rgba(47, 39, 24, 0.9), 0 0 8px rgba(255, 244, 203, 0.55)',
        }}
      >
        {claim.label}
      </span>
    </div>
  )
}

function Chip({
  word,
  mark,
  mergeHint,
  pulse,
  recall,
  recallMarker,
}: {
  word: FallingWord
  mark: number | undefined
  mergeHint: readonly string[] | undefined
  pulse: number
  recall: boolean
  recallMarker: 'hand' | 'heart' | undefined
}) {
  const missed = word.state === 'missed'
  // 놓친 단어에는 붙이지 않는다 — 이미 칠 수 없는 것에 "붙일 수 있다"고 알리는 셈이다
  const paired = mark !== undefined && !missed
  const recalled = recall && !missed
  const color = paired ? (PAIR_MARK_COLORS[mark % PAIR_MARK_COLORS.length] ?? null) : null
  const borderColor = recalled ? PAPER_EDGE : color ?? (missed ? 'rgba(160, 146, 118, 0.4)' : PAPER_EDGE)
  const glow = color === null
    ? 'none'
    : [
        `0 0 ${8 + pulse * 12}px ${alpha(color, 0.46 + pulse * 0.42)}`,
        `0 0 ${16 + pulse * 18}px ${alpha(color, 0.22 + pulse * 0.28)}`,
        `inset 0 0 ${5 + pulse * 5}px ${alpha(color, 0.2 + pulse * 0.18)}`,
      ].join(', ')
  const recallGlow = recalled
    ? [
        `0 0 ${10 + pulse * 10}px rgba(255, 248, 213, ${0.52 + pulse * 0.38})`,
        `0 0 ${20 + pulse * 16}px rgba(255, 248, 213, ${0.28 + pulse * 0.3})`,
        `inset 0 0 ${6 + pulse * 7}px rgba(255, 255, 244, ${0.32 + pulse * 0.32})`,
      ].join(', ')
    : null

  return (
    <div
      data-word={word.word}
      data-state={word.state}
      data-pair-mark={paired ? mark : undefined}
      data-recall={recalled ? 'true' : undefined}
      style={{
        ...chipBase,
        top: `${word.y * 100}%`,
        left: `${((word.slot + 0.5) / WORD.slotsPerSide) * 100}%`,
        /*
         * 세로는 **쪽지를 레인 안에 가둔다** — y=0이면 윗변이 레인 맨 위에, y=1이면
         * 아랫변이 바닥선에 닿는다.
         *
         * 한때 `translateY(-50%)` 고정이라 y=0에서 쪽지의 *중심*이 레인 맨 위에 왔고,
         * 위쪽 절반(22px)이 레인 밖으로 나가 상단 띠에 잘렸다. 판을 열자마자 보는
         * 첫 쪽지가 늘 그 상태였다.
         *
         * transform의 %는 **제 크기 기준**이라 쪽지 높이를 몰라도 된다. 글자 수마다
         * 크기가 다르고 화면 크기도 따라 변하는데, 그 값을 재서 넣으면 잴 때마다
         * 어긋난다.
         *
         * 놓침 판정은 그대로 y>=1이다(`WordSpawner`). 바뀐 것은 그 순간에 **쪽지의
         * 아랫변**이 바닥선에 있다는 것뿐이라, 오히려 눈에 보이는 것과 규칙이 맞는다.
         */
        transform: `translate(-50%, ${-word.y * 100}%)`,
        opacity: missed ? word.fade * 0.6 : 1,
        color: missed ? INK_MISSED : recalled ? RECALL_INK : INK,
        background: missed ? PAPER_MISSED : recalled ? RECALL_PAPER : PAPER,
        /*
         * 짝이 있으면 테두리가 그 짝의 색으로 바뀐다. 받침대의 물건에는 같은 색
         * 동그라미가 둘린다 — 색이 둘을 잇는다(까닭은 `systems/PairMarks.ts`에).
         */
        borderColor,
        /*
         * 숨 쉬듯 빛난다. 밝기는 엔진이 준 값이라 받침대의 물건과 **같은 순간**에 밝다.
         * CSS 애니메이션을 쓰지 않는 것은 이 칩이 매 프레임 다시 그려지기 때문이고,
         * 값으로 그리면 그 다시 그리는 일에 그냥 얹힌다.
         */
        boxShadow: [glow, recallGlow].filter((shadow) => shadow !== null && shadow !== 'none').join(', ') || 'none',
        borderWidth: paired ? 3 : 1,
        textDecoration: missed ? 'line-through' : 'none',
      }}
    >
      {recalled && recallMarker === 'heart' && (
        <span aria-hidden data-recall-heart style={recallHeartStyle}>♥</span>
      )}
      {recalled && recallMarker === 'hand' && <RecallHand />}
      {paired && !recalled && mergeHint !== undefined && mergeHint.length > 0 && (
        <span aria-hidden data-merge-hints={mergeHint.length} style={mergeHintRowStyle}>
          {mergeHint.map((sprite, index) => (
            <img
              key={`${sprite}-${index}`}
              data-merge-hint
              src={sprite}
              alt=""
              style={mergeHintStyle}
            />
          ))}
        </span>
      )}
      {word.word}
    </div>
  )
}

function RecallHand() {
  return (
    <span aria-hidden data-recall-hand style={recallHandStyle}>
      <img
        src={`${import.meta.env.BASE_URL}arena/catch-day.webp`}
        alt=""
        style={recallHandImageStyle}
      />
    </span>
  )
}

const recallHeartStyle: CSSProperties = {
  position: 'absolute',
  left: -7,
  top: -9,
  color: '#e95f70',
  fontFamily: 'var(--sans)',
  fontSize: 16,
  fontWeight: 900,
  lineHeight: 1,
  textShadow: '0 1px 0 #fff4e2, 0 0 5px rgba(233, 95, 112, 0.42)',
}

const recallHandStyle: CSSProperties = {
  position: 'absolute',
  left: -20,
  top: -23,
  width: 38,
  height: 39,
  overflow: 'hidden',
  pointerEvents: 'none',
  filter: 'drop-shadow(0 1px 1px rgba(47, 39, 24, 0.42))',
}

const recallHandImageStyle: CSSProperties = {
  position: 'absolute',
  width: 86,
  height: 'auto',
  right: 0,
  top: 0,
  maxWidth: 'none',
}

const mergeHintRowStyle: CSSProperties = {
  position: 'absolute',
  left: -10,
  top: -24,
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  pointerEvents: 'none',
}

const mergeHintStyle: CSSProperties = {
  width: 31,
  height: 31,
  flex: '0 0 31px',
  objectFit: 'contain',
  filter: 'drop-shadow(0 2px 2px rgba(47, 39, 24, 0.5))',
}

export { TypingLane }
export type { WordClaimNotice }
