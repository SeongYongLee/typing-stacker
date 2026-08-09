import type { CSSProperties, ReactNode } from 'react'
import { soundBoard } from '../audio/SoundBoard.ts'

/**
 * 키보드로 고르는 메뉴 버튼.
 *
 * 골라진 항목은 테두리 색과 배경으로 알린다. 브라우저 기본 포커스 링을 쓰지 않는
 * 이유는, 이 게임의 메뉴가 실제 포커스를 입력칸에 두고도 움직여야 하기 때문이다
 * (로비에는 이름 칸이 있고 판 중에는 단어 입력칸이 있다).
 */
interface MenuButtonProps {
  children: ReactNode
  selected: boolean
  onClick: () => void
  onHover?: () => void
  /** 가장 중요한 선택지. 골라지지 않았을 때도 눈에 띈다 */
  primary?: boolean
  disabled?: boolean
  style?: CSSProperties
}

function MenuButton({
  children,
  selected,
  onClick,
  onHover,
  primary = false,
  disabled = false,
  style,
}: MenuButtonProps) {
  const base: CSSProperties = {
    display: 'block',
    width: '100%',
    padding: '13px 30px',
    fontSize: primary ? 17 : 15,
    fontWeight: 600,
    borderRadius: 10,
    cursor: disabled ? 'default' : 'pointer',
    transition: 'background 120ms, border-color 120ms, color 120ms',
  }

  const look: CSSProperties = disabled
    ? { border: '1px solid #262b3d', background: '#1a1e2c', color: '#4a5171' }
    : primary
      ? {
          border: `1px solid ${selected ? '#e4e68a' : '#48507a'}`,
          background: selected ? '#e4e68a' : '#2c2413',
          color: selected ? '#1a1405' : '#e4e68a',
        }
      : {
          border: `1px solid ${selected ? '#e4e68a' : '#48507a'}`,
          background: selected ? '#2c2413' : 'transparent',
          color: selected ? '#e4e68a' : '#b6bdd4',
        }

  /* 키보드로 고르면 useMenuKeys가 소리를 낸다. 마우스로 누른 길에도 같은 소리가 나야 한다 */
  const activate = () => {
    soundBoard().handle({ kind: 'menuSelect' })
    onClick()
  }

  return (
    <button
      type="button"
      onClick={disabled ? undefined : activate}
      onMouseEnter={disabled ? undefined : onHover}
      disabled={disabled}
      className="menu-button"
      data-menu-item
      data-selected={selected ? 'yes' : 'no'}
      style={{ ...base, ...look, ...style }}
    >
      {children}
    </button>
  )
}

export { MenuButton }
