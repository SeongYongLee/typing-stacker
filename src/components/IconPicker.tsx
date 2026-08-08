import { useEffect, useMemo } from 'react'
import type { CSSProperties } from 'react'
import { Avatar } from './Avatar.tsx'
import { soundBoard } from '../audio/SoundBoard.ts'
import { hashOf } from '../game/data/materials.ts'
import { VARIANT_BY_ID } from '../game/data/words.ts'
import { loadCollection } from '../storage/collection.ts'

/**
 * 도감에서 모은 것 중 하나를 아이콘으로 고른다.
 *
 * **모은 것만 고를 수 있다.** 이름은 아무나 같은 재료로 만들 수 있지만 이 그림은 실제로
 * 만나본 물건이라, 남의 화면에 뜬 아이콘 하나가 그 사람이 무엇까지 봤는지를 말해준다 —
 * 모으는 일에 남에게 보일 자리가 생기는 것이다.
 *
 * 차례는 도감과 같다(id 해시). 무작위처럼 보이면서 언제 열어도 같은 자리라 어제 본
 * 물건을 다시 찾을 수 있다. 맨 앞은 '없음'이다 — 골랐다가 그만두는 길이 있어야 한다.
 *
 * 이름 화면은 이 부품을 쓰지 않는다. 그쪽은 꾸미말·물건과 같은 줄에 서야 해서
 * 생김새가 다르고, 여기는 이름 칸 아래에 홀로 놓인다.
 */
interface IconPickerProps {
  icon: string
  onChange: (icon: string) => void
  /**
   * 지금 이 줄이 골라져 있는가. 골라져 있을 때만 좌우 키를 듣는다.
   *
   * 화면에 값을 넘기는 줄이 여럿이면 좌우가 어느 줄의 것인지 정해져야 하는데,
   * 그 기준은 "지금 보고 있는 줄"이다 — 이름 화면이 쓰는 규칙과 같다.
   */
  selected?: boolean
  onHover?: () => void
}

const rootStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 10px',
  border: '1px solid #2e3448',
  borderRadius: 10,
  background: '#0d0f16',
}

const arrowStyle: CSSProperties = {
  width: 30,
  padding: '4px 0',
  fontSize: 14,
  color: '#8b93b0',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
}

function IconPicker({ icon, onChange, selected = false, onHover }: IconPickerProps) {
  const options = useMemo(
    () => ['', ...loadCollection().sort((a, b) => hashOf(a) - hashOf(b))],
    [],
  )
  const at = Math.max(0, options.indexOf(icon))
  const step = (by: number) => {
    onChange(options[(at + by + options.length) % options.length] ?? '')
  }

  /*
   * 좌우는 여기서 듣는다. `useMenuKeys`는 위아래로 고르는 것만 다루므로 —
   * 그쪽에 넣으면 값을 넘길 것이 없는 화면까지 좌우 키를 먹는다.
   */
  useEffect(() => {
    if (!selected) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const by = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
      if (by === 0) {
        return
      }
      event.preventDefault()
      step(by)
      soundBoard().handle({ kind: 'menuMove' })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const label =
    icon === ''
      ? options.length > 1
        ? '없음'
        : '아직 모은 물건이 없다'
      : (VARIANT_BY_ID.get(icon)?.label ?? icon)

  return (
    <div
      style={{
        ...rootStyle,
        borderColor: selected ? '#ffcf5c' : '#2e3448',
        background: selected ? '#2c2413' : '#0d0f16',
      }}
      onMouseEnter={onHover}
      /*
       * Tab으로도 닿을 수 있어야 한다. 이 줄이 놓인 화면에는 이름 칸이 있고 그 칸이
       * 포커스를 쥐고 있는 동안에는 메뉴가 화살표를 듣지 않는다(글자를 치는 중이므로).
       * 그때 여기로 오는 길이 Tab뿐이라, 스스로도 키를 들어야 한다.
       */
      tabIndex={0}
      role="group"
      aria-label="아이콘 고르기"
      onKeyDown={(event) => {
        const by = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
        if (by === 0) {
          return
        }
        event.preventDefault()
        step(by)
        soundBoard().handle({ kind: 'menuMove' })
      }}
      data-icon-picker={icon === '' ? 'none' : icon}
      data-selected={selected ? 'yes' : 'no'}
    >
      <button type="button" style={arrowStyle} onClick={() => step(-1)} aria-label="이전 아이콘">
        ◀
      </button>
      <Avatar icon={icon} size={34} />
      <span
        style={{ flex: 1, fontSize: 14, color: selected ? '#ffcf5c' : '#b6bdd4', textAlign: 'left' }}
      >
        {label}
      </span>
      <button type="button" style={arrowStyle} onClick={() => step(1)} aria-label="다음 아이콘">
        ▶
      </button>
    </div>
  )
}

export { IconPicker }
