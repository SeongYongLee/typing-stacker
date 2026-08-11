import { useCallback, useEffect, useRef, useState } from 'react'
import { soundBoard } from '../audio/SoundBoard.ts'

/**
 * 메뉴를 키보드로 움직인다.
 *
 * 이 게임은 손이 키보드에 붙어 있는 게임이다. 메뉴에서만 마우스를 잡아야 하면
 * 그 순간 흐름이 끊긴다. 위아래 화살표와 Tab으로 고르고 Enter로 들어간다.
 *
 * 브라우저의 기본 Tab 이동을 쓰지 않는 이유는 두 가지다. 화면에 입력칸이 섞여 있어
 * 순서가 뒤엉키고(로비에는 이름·방 코드 칸이 있다), 무엇이 골라졌는지 보여주는
 * 방식을 화면마다 맞춰야 하기 때문이다.
 *
 * 글자를 치는 중에는 끼어들지 않는다 — 입력칸에 포커스가 있으면 화살표는
 * 커서를 옮기는 데 쓰여야 한다.
 */
interface MenuKeys {
  /** 지금 골라진 항목 번호 */
  readonly index: number
  /** 마우스가 올라갔을 때 등, 바깥에서 골라진 항목을 옮긴다 */
  readonly select: (next: number) => void
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable
  )
}

interface MenuKeysOptions {
  /** 항목 수 */
  readonly count: number
  /** Enter를 눌렀을 때 */
  readonly onActivate: (index: number) => void
  /** Escape를 눌렀을 때. 없으면 Escape를 흘려보낸다 */
  readonly onCancel?: () => void
  /** false면 키를 듣지 않는다 — 화면이 가려져 있을 때 */
  readonly active?: boolean
  readonly initialIndex?: number
  /**
   * Tab으로도 고를지. 입력칸이 섞인 화면에서는 꺼야 한다 —
   * 로비에는 이름 칸과 방 코드 칸이 있어서, Tab을 가로채면 그리로 갈 길이 막힌다.
   */
  readonly useTab?: boolean
  /**
   * 입력칸에 포커스가 있어도 방향키와 Tab으로 메뉴를 움직인다. 빈 입력에서 누른
   * Enter도 메뉴를 실행하지만, 글자가 있으면 입력칸의 제출을 우선한다.
   */
  readonly navigateFromInput?: boolean
}

function useMenuKeys({
  count,
  onActivate,
  onCancel,
  active = true,
  initialIndex = 0,
  useTab = true,
  navigateFromInput = false,
}: MenuKeysOptions): MenuKeys {
  const [index, setIndex] = useState(initialIndex)

  /*
   * 콜백을 ref로 들고 있는다. 화면들이 인라인 화살표 함수를 넘기므로
   * 의존성에 넣으면 매 렌더마다 리스너를 떼었다 붙인다.
   */
  const activate = useRef(onActivate)
  const cancel = useRef(onCancel)
  activate.current = onActivate
  cancel.current = onCancel

  /*
   * 골라진 자리를 ref로도 들고 있는다.
   *
   * setState 업데이터 안에서 읽으면 최신값을 얻을 수 있지만, 그 안에서 소리를 내거나
   * 항목을 실행하면 StrictMode가 업데이터를 두 번 돌릴 때 그것도 두 번 일어난다.
   * 부수효과는 업데이터 밖에 두고, 최신값은 여기서 읽는다.
   */
  const indexRef = useRef(initialIndex)

  const moveTo = useCallback((next: number) => {
    indexRef.current = next
    setIndex(next)
  }, [])

  // 항목이 줄어들면 골라진 자리가 사라질 수 있다
  useEffect(() => {
    if (indexRef.current >= count) {
      const next = Math.max(0, count - 1)
      indexRef.current = next
      setIndex(next)
    }
  }, [count])

  useEffect(() => {
    if (!active || count === 0) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (cancel.current !== undefined) {
          event.preventDefault()
          cancel.current()
        }
        return
      }

      const typingTarget = isTypingTarget(event.target)
      if (typingTarget && !navigateFromInput) {
        return
      }

      if (typingTarget) {
        const input = event.target as HTMLInputElement | HTMLTextAreaElement
        const navigationKey =
          event.key === 'ArrowDown' || event.key === 'ArrowUp' ||
          (useTab && event.key === 'Tab')
        const activateKey = event.key === 'Enter' && input.value.trim().length === 0
        if (!navigationKey && !activateKey) {
          return
        }
      }

      const tab = useTab && event.key === 'Tab'
      const step =
        event.key === 'ArrowDown' || (tab && !event.shiftKey)
          ? 1
          : event.key === 'ArrowUp' || (tab && event.shiftKey)
            ? -1
            : 0

      if (step !== 0) {
        event.preventDefault()
        // 끝에서 반대편으로 돌아간다 — 항목이 서너 개뿐이라 끝을 만날 일이 잦다
        moveTo((indexRef.current + step + count) % count)
        soundBoard().handle({ kind: 'menuMove' })
        return
      }

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        soundBoard().handle({ kind: 'menuSelect' })
        activate.current(indexRef.current)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active, count, navigateFromInput, useTab, moveTo])

  /** 마우스가 올라왔다. 자리가 실제로 바뀔 때만 소리를 낸다 */
  const select = useCallback(
    (next: number) => {
      if (next === indexRef.current) {
        return
      }
      moveTo(next)
      soundBoard().handle({ kind: 'menuMove' })
    },
    [moveTo],
  )

  return { index, select }
}

export { useMenuKeys }
