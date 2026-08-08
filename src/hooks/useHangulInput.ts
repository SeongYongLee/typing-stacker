import { useCallback, useRef, useState } from 'react'
import type {
  MouseEvent as ReactMouseEvent,
  ChangeEvent,
  CompositionEvent,
  KeyboardEvent,
  RefObject,
} from 'react'

interface HangulInput {
  readonly ref: RefObject<HTMLInputElement | null>
  readonly value: string
  readonly composing: boolean
  /** 글자가 실제로 들어오거나 지워질 때마다 올라간다 — 입력칸 타격 연출의 트리거 */
  readonly tapSeq: number
  readonly onChange: (event: ChangeEvent<HTMLInputElement>) => void
  readonly onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  readonly onCompositionStart: () => void
  readonly onCompositionEnd: (event: CompositionEvent<HTMLInputElement>) => void
  readonly clear: () => void
  readonly focus: () => void
  /**
   * 화면 아무 곳이나 눌러도 입력칸으로 포커스를 되돌린다.
   * 마우스로 잠깐 딴 곳을 눌렀다고 손이 멈추면 안 된다 — 이 게임은 그 사이에도
   * 단어가 계속 내려온다.
   */
  readonly keepFocus: (event: ReactMouseEvent<HTMLElement>) => void
}

/**
 * 한글 IME 입력 훅.
 *
 * 핵심 문제: 조립 중에 Enter를 누르면 브라우저가 그 Enter를 조립 확정에 써버리고
 * keydown의 isComposing이 true로 온다. 흔히 쓰는 `if (isComposing) return` 가드를
 * 넣으면 "사과" 입력 후 Enter를 두 번 눌러야 제출된다. 이 게임에서 Enter 타이밍은
 * 곧 조준이므로 첫 Enter가 먹히지 않으면 조준이 어긋난다 — 그래서 가드를 두지 않고
 * isComposing이어도 Enter를 받아들이고 그 시점의 DOM value를 제출값으로 쓴다.
 *
 * 그 대가로 제출 직후 조립 확정이 값을 되살려 놓는 문제가 생기는데,
 * `swallow` 플래그로 그 뒷정리 이벤트를 삼킨다. 플래그는 compositionend에서
 * 풀지 않고 "사용자가 다음 키를 누를 때"만 푼다 — input과 compositionend의
 * 발생 순서가 브라우저마다 달라서, 순서에 의존하지 않는 유일한 기준점이 keydown이다.
 */
function useHangulInput(onSubmit: (text: string) => void): HangulInput {
  const ref = useRef<HTMLInputElement | null>(null)
  const [value, setValue] = useState('')
  const [composing, setComposing] = useState(false)
  const [tapSeq, setTapSeq] = useState(0)
  const swallow = useRef(false)

  const clear = useCallback(() => {
    if (ref.current !== null) {
      ref.current.value = ''
    }
    setValue('')
  }, [])

  const focus = useCallback(() => {
    ref.current?.focus()
  }, [])

  /**
   * mousedown에서 막아야 한다.
   *
   * 누를 때 포커스만 옮겨주면 그 직후 브라우저 기본 동작이 도로 가져간다 —
   * 실제로 아레나를 클릭하면 activeElement가 body가 됐다. 기본 동작 자체를
   * 막아야 포커스가 입력칸에 남는다.
   *
   * 버튼이나 다른 입력칸을 누른 것이면 손대지 않는다. 그쪽이 눌려야 하고,
   * 입력칸 안에서는 드래그로 글자를 고를 수 있어야 한다.
   */
  const keepFocus = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    const target = event.target
    if (
      target instanceof Element &&
      target.closest('input, textarea, button, a, label, select, [contenteditable]')
    ) {
      return
    }
    event.preventDefault()
    ref.current?.focus()
  }, [])

  const onChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (swallow.current) {
        event.currentTarget.value = ''
        setValue('')
        return
      }
      setValue(event.currentTarget.value)
      setTapSeq((seq) => seq + 1)
    },
    [],
  )

  const onCompositionStart = useCallback(() => {
    setComposing(true)
  }, [])

  const onCompositionEnd = useCallback((event: CompositionEvent<HTMLInputElement>) => {
    setComposing(false)
    if (swallow.current) {
      event.currentTarget.value = ''
      setValue('')
      return
    }
    setValue(event.currentTarget.value)
  }, [])

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter') {
        // 사용자가 실제로 다음 입력을 시작했다 — 뒷정리 대기 상태를 푼다
        swallow.current = false
        return
      }

      event.preventDefault()
      const element = event.currentTarget
      const text = element.value
      const composingNow = event.nativeEvent.isComposing

      /*
       * 빈 입력은 제출하지 않는다.
       * 한글 IME는 조립 확정 Enter를 한 번 더 흘려보내는데(macOS Chrome에서
       * keydown Enter가 isComposing=true / false로 두 번 온다), 그 두 번째 Enter가
       * 방금 비운 입력창을 제출해 성공 피드백을 "(빈 입력) ✗"로 덮어쓴다.
       */
      if (text.trim().length === 0) {
        return
      }

      onSubmit(text)
      element.value = ''
      setValue('')
      // 조립 중이었다면 확정 이벤트가 뒤따라오므로 그것만 삼킬 준비를 한다
      swallow.current = composingNow
    },
    [onSubmit],
  )

  return {
    ref,
    value,
    composing,
    tapSeq,
    onChange,
    onKeyDown,
    onCompositionStart,
    onCompositionEnd,
    clear,
    focus,
    keepFocus,
  }
}

export { useHangulInput }
export type { HangulInput }
