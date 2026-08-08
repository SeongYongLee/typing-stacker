import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { soundBoard } from '../audio/SoundBoard.ts'

/**
 * 메뉴의 한 줄이 되는 입력칸.
 *
 * 글자를 치는 동안에는 `useMenuKeys`가 화살표를 듣지 않는다 — 그래야 커서를 옮길 수
 * 있기 때문이다. 그런데 그 규칙 때문에 **이름을 다 적고 나면 갈 길이 막혔다.** 아래로
 * 내려가려면 마우스를 잡거나 Tab이 어디로 갈지 운에 맡겨야 했는데, 이 게임은 손이
 * 키보드에 붙어 있는 게임이다.
 *
 * 그래서 입력칸이 자기 줄을 안다. 위아래와 Tab은 줄을 옮기고, 좌우는 커서에게 남긴다.
 * 줄이 이리로 오면 스스로 포커스를 가져오므로, 어느 쪽에서 들어와도 바로 칠 수 있다.
 */
interface MenuFieldProps {
  value: string
  onChange: (value: string) => void
  /** 이 줄의 번호. 위아래로 옮길 때 기준이 된다 */
  index: number
  selected: boolean
  /** 줄을 옮긴다. 끝에서 반대편으로 돌아가는 것은 부르는 쪽이 정한다 */
  onMove: (next: number) => void
  /** Enter를 눌렀을 때. 없으면 아무 일도 하지 않는다 */
  onSubmit?: () => void
  placeholder?: string
  maxLength?: number
  label: string
  style?: CSSProperties
  spellCheck?: boolean
  autoCapitalize?: string
}

function MenuField({
  value,
  onChange,
  index,
  selected,
  onMove,
  onSubmit,
  placeholder,
  maxLength,
  label,
  style,
  spellCheck = false,
  autoCapitalize,
}: MenuFieldProps) {
  const ref = useRef<HTMLInputElement | null>(null)

  /*
   * 줄이 이리로 오면 포커스를 가져온다. 골라진 줄과 글자가 들어가는 곳이 다르면
   * 테두리는 여기 있는데 친 글자는 다른 데로 가는, 설명할 수 없는 상태가 된다.
   */
  useEffect(() => {
    if (selected && document.activeElement !== ref.current) {
      ref.current?.focus()
    }
  }, [selected])

  return (
    <input
      ref={ref}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      spellCheck={spellCheck}
      autoCapitalize={autoCapitalize}
      aria-label={label}
      data-menu-field={label}
      data-selected={selected ? 'yes' : 'no'}
      onFocus={() => {
        // 마우스로 눌러 들어온 경우에도 골라진 줄이 여기로 와야 한다
        if (!selected) {
          onMove(index)
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          onSubmit?.()
          return
        }
        const step =
          event.key === 'ArrowDown' || (event.key === 'Tab' && !event.shiftKey)
            ? 1
            : event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey)
              ? -1
              : 0
        if (step === 0) {
          // 좌우와 나머지는 커서의 것이다
          return
        }
        event.preventDefault()
        onMove(index + step)
        soundBoard().handle({ kind: 'menuMove' })
        event.currentTarget.blur()
      }}
      style={{
        ...style,
        borderColor: selected ? '#ffcf5c' : (style?.borderColor ?? '#2e3448'),
      }}
    />
  )
}

export { MenuField }
