import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { SubmitFeedback } from '../game/core/GameEngine.ts'
import type { RunStats } from '../game/types/game.ts'
import type { HangulInput } from '../hooks/useHangulInput.ts'
import { play } from './animate.ts'
import { Combo, Lives, Score } from './Vitals.tsx'
import { ARENA_ART } from '../game/renderer/arenaArt.generated.ts'

interface InputBarProps {
  input: HangulInput
  feedback: SubmitFeedback | null
  stats: RunStats
  /** 남은 무적 시간 비율(0~1). 하트에 베리어로 보여준다 */
  invulnerable: number
  /** 화면이 Night Fever인가. 남은 하트를 연보라색으로 빛낸다 */
  fever: boolean
  /** 0 → 낮, 1 → 밤. 메모장과 연필의 조명이 방을 따라간다 */
  nightfall: number
}

interface MemoInputProps {
  input: HangulInput
  nightfall: number
  ariaLabel: string
  width?: CSSProperties['width']
  /** 틀린 입력마다 바뀌는 번호. null이면 실패 연출을 하지 않는다. */
  invalidSeq?: number | null
}

/*
 * 입력창은 **보관소의 메모장**이다. 들어온 물건의 이름을 여기에 적는다.
 *
 * 종이 위에 쓰는 것이므로 글씨는 먹빛이다 — 예전의 흰 글씨(`#f2f4fb`)를 그대로
 * 두면 크림색 종이 위에서 사라진다. 낙하 단어 쪽지와 같은 종이·먹빛을 쓴다.
 */
const INK = '#2f2718'
const UNDERLINE = 'rgba(90, 74, 46, 0.45)'
const UNDERLINE_COMPOSING = '#a5762a'
const DANGER = '#ff6b6b'
const INPUT_FONT = '400 28px/1.2 "GriunXHangeul A Foreign Hand", "Apple SD Gothic Neo", "Malgun Gothic", cursive'

/** 메모장이 입력칸 둘레로 번져 나가는 몫. 글자가 종이 끝에 닿으면 넘친 것으로 보인다 */
const MEMO_PAD = 1.06

/**
 * 종이가 글자 위로 올라가는 높이와 보여줄 세로 길이(px).
 *
 * 스프링이 글자 위에 오도록 올려 잡되, **아래로는 입력칸을 조금만 넘어선다.**
 * 넉넉히 두었더니 종이가 옆의 점수와 아래 피드백 줄까지 덮었다 — 둘 다 판이
 * 도는 동안 읽어야 하는 것이라 장식이 가리면 안 된다.
 */
const MEMO_TOP = -38
const MEMO_HEIGHT = 86

const wrapStyle: CSSProperties = {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
  padding: '14px 20px',
  /*
   * 아래로 갈수록 짙어지는 **그러데이션**이다. 띠를 세우면 거기서 방이 잘리고,
   * 아예 비우면 글자가 묻힌다 — 하필 이 자리 뒤가 방에서 가장 밝은 바닥이라
   * 회색 이름표("목숨"·"콤보")가 실기에서 통째로 사라졌다.
   *
   * 위쪽이 투명해 방이 이어져 보이고, 아래로 내려가며 짙어져 글자를 받쳐준다.
   * 경계선이 없으므로 어디서 끊겼는지 눈에 잡히지 않는다.
   */
  background:
    'linear-gradient(to bottom, rgba(13, 15, 22, 0) 0%, rgba(13, 15, 22, 0.58) 42%, rgba(13, 15, 22, 0.88) 100%)',
  // 배경 층이 뒤로 가려면 이쪽이 쌓임 순서를 가져야 한다
  zIndex: 1,
}

const inputStyle: CSSProperties = {
  width: '100%',
  minWidth: 0,
  font: INPUT_FONT,
  color: INK,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  padding: 0,
  textAlign: 'center',
  caretColor: '#e4e68a',
  // 종이보다 앞에 있어야 한다
  position: 'relative',
  zIndex: 1,
}

/**
 * 입력칸 뒤에 깔리는 메모장. 낮/밤 두 장을 겹쳐 밤 쪽만 알파를 올린다.
 *
 * 종이가 입력칸보다 크므로 `inset`을 음수로 밀어 둘레로 번지게 한다 — 종이 위에
 * 글자가 놓인 것으로 보이려면 글자 둘레에 여백이 있어야 한다.
 */
function MemoPad({ nightfall }: { nightfall: number }) {
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
      <div style={memoLayer('memo-day', 1)} />
      <div style={memoLayer('memo-night', nightfall)} />
    </div>
  )
}

function memoLayer(name: 'memo-day' | 'memo-night', alpha: number): CSSProperties {
  const grow = `${((MEMO_PAD - 1) / 2) * 100}%`
  return {
    position: 'absolute',
    left: `-${grow}`,
    right: `-${grow}`,
    /*
     * **위쪽만 보여준다.** 그림 비율을 그대로 지키면 종이가 세로 163px이 되어 아래
     * 피드백 줄("우산 ✓ → 접힌 우산 ★")을 통째로 삼켰다 — 무엇을 얻었는지 알리는
     * 줄이라 가려지면 안 된다.
     *
     * 가로만 늘리고 세로는 잘라내므로 스프링과 종이의 비율은 그대로다. 아래가
     * 잘린 것은 흠이 아니라 **화면 밖으로 이어지는 메모장**으로 읽힌다.
     */
    top: MEMO_TOP,
    height: MEMO_HEIGHT,
    backgroundImage: `url(${import.meta.env.BASE_URL}arena/${ARENA_ART[name].file})`,
    backgroundSize: '100% auto',
    backgroundPosition: 'center top',
    backgroundRepeat: 'no-repeat',
    opacity: alpha,
  }
}

/**
 * 치는 동안 글자 끝에 서는 연필.
 *
 * 입력칸이 가운데 정렬이라 글자는 양쪽으로 자란다 — 연필을 칸 오른쪽 끝에 붙이면
 * 짧은 단어에서 글자와 멀어진다. 그래서 **입력칸 가운데에서 글자 폭의 절반만큼**
 * 오른쪽에 세운다. 그림의 심이 왼쪽을 향하고 있어 그대로 글자를 가리킨다.
 */
/**
 * 연필 그림에서 **심 끝**이 어디인가(0~1).
 *
 * 이 점이 마지막 글자에 닿아야 쓰고 있는 것으로 보인다. 그림 왼쪽 끝의 뾰족한
 * 자리이고, 알파로는 잴 수 없어 눈으로 정했다 — 그림을 다시 그리면 다시 봐야 한다.
 */
const PENCIL_TIP_X = 0.03
const PENCIL_TIP_Y = 0.62

/** 쥐고 쓰는 각도. 눕히면 종이 위에 놓아둔 것으로 보인다 */
const PENCIL_ANGLE = -42

/**
 * 글자 폭을 재는 숨은 칸. 입력칸과 **같은 글꼴**이어야 잰 값이 맞는다.
 *
 * `white-space: pre`로 두는 것은 끝의 공백까지 세기 위해서다. 그냥 두면 브라우저가
 * 접어버려서 스페이스를 친 동안 연필이 제자리에 멈춘다.
 */
const rulerStyle: CSSProperties = {
  position: 'absolute',
  visibility: 'hidden',
  pointerEvents: 'none',
  whiteSpace: 'pre',
  font: INPUT_FONT,
}

/**
 * 치는 동안 글자 끝에서 쓰는 연필.
 *
 * ## 심이 글자에 닿는다
 *
 * 바깥 상자를 **심이 놓일 자리**에 크기 0으로 세우고, 그 안에서 그림을 심만큼
 * 되밀어 그린다. 그러면 각도를 바꿔도 심은 그 점에 머문다 — 상자 모서리를 기준으로
 * 잡으면 회전할 때마다 심이 글자에서 떨어진다.
 *
 * 입력칸이 가운데 정렬이라 글자는 양쪽으로 자라므로, 자리는 칸의 오른쪽 끝이 아니라
 * **가운데에서 글자 폭의 절반**만큼 나간 곳이다. 한글은 한 자가 대략 1em이다.
 *
 * ## 한 글자마다 한 번 긋는다
 *
 * 글자가 들어올 때마다 짧게 각도를 틀고 아래로 눌렀다 돌아온다. 가만히 서 있으면
 * 글자는 저절로 적히고 연필은 옆에 놓인 장식이 된다 — 손이 쓰고 있다는 것이
 * 보여야 입력칸이 곧 메모장이라는 말이 성립한다.
 */
function Pencil({
  text,
  nightfall,
  tapSeq,
}: {
  text: string
  nightfall: number
  tapSeq: number
}) {
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const rulerRef = useRef<HTMLSpanElement | null>(null)
  const [halfWidth, setHalfWidth] = useState(0)

  /*
   * **글자 폭을 실제로 잰다.**
   *
   * 처음에는 글자 수에 `0.5em`을 곱해 어림했는데, 길어질수록 어긋났다 — 조립 중인
   * 자모(ㅇㄴㅁ)는 완성자보다 좁고 영문·공백은 더 좁아서 곱셈이 맞지 않는다.
   * 같은 글꼴로 숨은 칸에 똑같이 써보고 그 폭을 그대로 쓴다.
   *
   * 그리기 전에 재야 한 프레임 늦게 따라오는 일이 없다(`useLayoutEffect`).
   */
  useLayoutEffect(() => {
    setHalfWidth((rulerRef.current?.offsetWidth ?? 0) / 2)
  }, [text])

  useEffect(() => {
    if (tapSeq === 0) {
      return
    }
    play(
      bodyRef.current,
      [
        { transform: `rotate(${PENCIL_ANGLE}deg) translate(0, 0)` },
        {
          transform: `rotate(${PENCIL_ANGLE + 5}deg) translate(-1px, 2px)`,
          offset: 0.4,
        },
        { transform: `rotate(${PENCIL_ANGLE}deg) translate(0, 0)` },
      ],
      { duration: 150, easing: 'ease-out' },
    )
  }, [tapSeq])

  if (text.length === 0) {
    return null
  }
  const art = ARENA_ART['pencil-day']
  const width = 92
  const height = width * (art.height / art.width)

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        /*
         * 글자는 가운데에서 양쪽으로 자라므로 절반만큼 오른쪽이 끝이다.
         *
         * `min`으로 칸 오른쪽에 **묶어둔다.** 글자가 칸보다 길어지면 입력칸이
         * 밀리면서 보이는 끝이 칸의 오른쪽 가장자리가 되는데, 묶어두지 않으면
         * 연필만 계산대로 더 나가 종이 밖에 선다.
         */
        left: `min(calc(50% + ${halfWidth}px), calc(100% - 6px))`,
        // 글자가 앉는 줄. 심이 여기 닿는다
        top: '78%',
        width: 0,
        height: 0,
        zIndex: 2,
        pointerEvents: 'none',
      }}
    >
      <span ref={rulerRef} style={rulerStyle} aria-hidden>
        {text}
      </span>
      <div
        ref={bodyRef}
        style={{
          position: 'absolute',
          left: -PENCIL_TIP_X * width,
          top: -PENCIL_TIP_Y * height,
          width,
          height,
          transformOrigin: `${PENCIL_TIP_X * 100}% ${PENCIL_TIP_Y * 100}%`,
          transform: `rotate(${PENCIL_ANGLE}deg)`,
        }}
      >
        <div style={pencilLayer('pencil-day', 1)} />
        <div style={pencilLayer('pencil-night', nightfall)} />
      </div>
    </div>
  )
}

function pencilLayer(name: 'pencil-day' | 'pencil-night', alpha: number): CSSProperties {
  return {
    position: 'absolute',
    inset: 0,
    backgroundImage: `url(${import.meta.env.BASE_URL}arena/${ARENA_ART[name].file})`,
    backgroundSize: '100% 100%',
    opacity: alpha,
  }
}

const labelStyle: CSSProperties = {
  fontSize: 13,
  color: '#a7afc9',
  // 그림자는 이름표에만. 띠 전체에 주면 메모장 위의 먹빛 글씨까지 번진다
  textShadow: '0 1px 4px rgba(8, 10, 16, 0.9)',
  letterSpacing: '0.08em',
  flexShrink: 0,
}

/**
 * 목숨 · 입력칸 · 점수/콤보 묶음을 세 칸에 둔다.
 * 양옆을 같은 `minmax(0, 1fr)`로 잡아서 커진 묶음의 내용 폭과 무관하게 입력칸은
 * 정확히 화면 중앙에 온다.
 */
const rowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
  alignItems: 'center',
  gap: 28,
  width: '100%',
}

function MemoInput({
  input,
  nightfall,
  ariaLabel,
  width = 'min(420px, 34vw)',
  invalidSeq = null,
}: MemoInputProps) {
  const fieldRef = useRef<HTMLDivElement | null>(null)
  const underlineRef = useRef<HTMLDivElement | null>(null)

  // 글자가 들어올 때마다 글자만 살짝 눌러 타격감을 준다 — 밑줄은 기준선이니 고정한다
  useEffect(() => {
    if (input.tapSeq === 0) {
      return
    }
    play(
      input.ref.current,
      [
        { transform: 'translateY(0)' },
        { transform: 'translateY(2px)', offset: 0.35 },
        { transform: 'translateY(0)' },
      ],
      { duration: 110, easing: 'ease-out' },
    )
  }, [input.tapSeq, input.ref])

  /**
   * 틀린 단어는 물건이 떨어지지 않아 화면에 아무 일도 일어나지 않는다.
   * 입력칸을 좌우로 흔들고 밑줄을 붉게 튀겨서 빗나갔다는 것을 몸으로 알게 한다.
   */
  useEffect(() => {
    if (invalidSeq === null) {
      return
    }
    play(
      fieldRef.current,
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-7px)' },
        { transform: 'translateX(6px)' },
        { transform: 'translateX(-3px)' },
        { transform: 'translateX(0)' },
      ],
      { duration: 240, easing: 'ease-in-out' },
    )
    play(
      underlineRef.current,
      [
        { backgroundColor: DANGER },
        { backgroundColor: DANGER, offset: 0.5 },
        { backgroundColor: UNDERLINE },
      ],
      { duration: 420, easing: 'linear' },
    )
  }, [invalidSeq])

  return (
    <div ref={fieldRef} style={{ width, position: 'relative' }}>
      <MemoPad nightfall={nightfall} />
      <Pencil text={input.value} nightfall={nightfall} tapSeq={input.tapSeq} />
      <input
        ref={input.ref}
        style={inputStyle}
        value={input.value}
        onChange={input.onChange}
        onKeyDown={input.onKeyDown}
        onCompositionStart={input.onCompositionStart}
        onCompositionEnd={input.onCompositionEnd}
        autoFocus
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-label={ariaLabel}
      />
      <div
        ref={underlineRef}
        style={{
          height: 2,
          marginTop: 4,
          background: input.composing ? UNDERLINE_COMPOSING : UNDERLINE,
          transition: 'background 120ms',
          position: 'relative',
          zIndex: 1,
        }}
      />
    </div>
  )
}

function InputBar({ input, feedback, stats, invulnerable, fever, nightfall }: InputBarProps) {
  return (
    <div style={wrapStyle}>
      <div style={rowStyle}>
        <div style={{ justifySelf: 'end' }}>
          <Lives lives={stats.lives} invulnerable={invulnerable} fever={fever} />
        </div>
        <MemoInput
          input={input}
          nightfall={nightfall}
          ariaLabel="단어 입력"
          invalidSeq={feedback !== null && !feedback.ok ? feedback.seq : null}
        />
        {/* 두 배로 커진 점수와 콤보를 쌓아 입력칸의 화면 중앙 자리를 지킨다 */}
        <div
          style={{
            justifySelf: 'start',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 8,
          }}
        >
          <Score score={stats.score} />
          <Combo combo={stats.combo} />
        </div>
      </div>
      <FeedbackChip feedback={feedback} />
    </div>
  )
}

function FeedbackChip({ feedback }: { feedback: SubmitFeedback | null }) {
  if (feedback === null) {
    return <span style={{ ...labelStyle, height: 22 }}>단어를 입력하고 Enter</span>
  }

  const color = feedback.ok ? '#6bffb0' : DANGER
  /*
   * 화살표는 **히든이 나왔을 때만** 띄운다.
   *
   * 예전에는 "이름이 단어와 다르면" 띄웠는데, 그러면 기본 물건인데도 이름만 다르면
   * 뭔가 특별한 것이 나온 것처럼 보였다. 이 표시의 목적은 운으로 다른 것이 나왔다는
   * 것을 알리는 데 있지 이름이 다르다는 것을 알리는 데 있지 않다.
   */
  const showItem = feedback.hidden && feedback.itemLabel !== null
  return (
    <span
      key={feedback.seq}
      style={{
        height: 22,
        fontSize: 15,
        color,
        whiteSpace: 'nowrap',
      }}
    >
      {feedback.text || '(빈 입력)'} {feedback.ok ? '✓' : '✗'}
      {showItem && (
        <span style={{ color: feedback.hidden ? '#e4e68a' : '#b6bdd4' }}>
          {' → '}
          {feedback.itemLabel}
          {feedback.hidden && ' ★'}
        </span>
      )}
      {/* 대기 중인 물건을 막았다는 것은 점수보다 중요한 정보다 */}
    </span>
  )
}

export { InputBar, MemoInput }
