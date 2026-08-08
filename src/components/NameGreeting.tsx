import type { CSSProperties } from 'react'
import { Avatar } from './Avatar.tsx'
import { MenuButton } from './MenuButton.tsx'

/**
 * 인사와 프로필 바꾸기.
 *
 * 이름은 목록의 맨 앞이되 버튼 무리에는 끼지 않는다. 같은 크기의 버튼으로 세워봤더니
 * '혼자 하기'와 같은 무게로 읽혔다 — 이름은 하러 온 일이 아니라 **내가 누구로
 * 보이는가**다. 인사로 이름을 늘 보여주고 바꾸는 길만 작게 붙이면, 눈에는 먼저 닿되
 * 시작하는 길을 막지 않는다.
 */
interface NameGreetingProps {
  name: string
  /** 아이콘으로 쓰는 물건 id. 아직 안 골랐으면 빈 문자열 */
  icon: string
  selected: boolean
  onSelect: () => void
  onActivate: () => void
}

/** 메뉴와 한 칸 떨어뜨린다. 붙여두면 이것도 하러 온 일처럼 읽힌다 */
const rootStyle: CSSProperties = {
  display: 'grid',
  gap: 8,
  marginBottom: 14,
  paddingBottom: 14,
  borderBottom: '1px solid #262b3d',
  textAlign: 'center',
}

function NameGreeting({ name, icon, selected, onSelect, onActivate }: NameGreetingProps) {
  return (
    <div style={rootStyle}>
      <p
        style={{
          margin: 0,
          fontSize: 13,
          color: '#8b93b0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
        data-greeting
      >
        <Avatar icon={icon} size={26} />
        <span>
          반가워요, <strong style={{ color: '#f2f4fb' }}>{name}</strong>님
        </span>
      </p>
      <MenuButton
        selected={selected}
        onClick={onActivate}
        onHover={onSelect}
        style={{ padding: '7px 14px', fontSize: 13 }}
      >
        프로필 바꾸기
      </MenuButton>
    </div>
  )
}

export { NameGreeting }
