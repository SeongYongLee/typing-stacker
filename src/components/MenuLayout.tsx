import type { CSSProperties, ReactNode } from 'react'

/**
 * 고를 것이 있는 화면의 뼈대 — 제목 / 왼쪽 메뉴 · 오른쪽 판 / 아래 힌트.
 *
 * 시작 화면과 대전 대기방이 같은 것을 쓴다. 두 화면이 하는 일이 같기 때문이고,
 * 무엇보다 **오갈 때 제목과 인사가 제자리에 있어야** 하기 때문이다. 화면마다 따로
 * 짜면 글자 크기나 줄 수가 조금만 달라져도 가운데 정렬이 전체를 위아래로 밀어서,
 * 들어갔다 나올 때마다 방금 보던 것이 다른 자리에 있다.
 *
 * 그래서 제목 칸의 **높이를 못 박는다.** 시작 화면의 이름은 크고(46px) 대기방 제목은
 * 작은데(32px), 칸이 같으면 글자 크기가 달라도 아래가 밀리지 않는다.
 */
interface MenuLayoutProps {
  title: string
  /** 제목 글자 크기. 칸 높이는 그대로다 */
  titleSize?: number
  /** 왼쪽 기둥 — 인사와 버튼들 */
  menu: ReactNode
  /** 오른쪽 기둥 — SidePanel */
  panel: ReactNode
  hint: string
}

const rootStyle: CSSProperties = {
  height: '100%',
  display: 'grid',
  placeItems: 'center',
  padding: 24,
}

/**
 * 글자 크기가 달라도 제목이 **같은 자리에** 서도록 칸과 줄 높이를 함께 고정한다.
 *
 * 칸 높이만 잡고 줄 높이를 글자 크기에 맡겼더니 제목 자체는 8px 어긋났다 — 46px 글자와
 * 32px 글자의 줄 상자가 다르고, 가운데 정렬은 그 차이를 위아래로 나눠 갖기 때문이다.
 */
const HEADER_HEIGHT = 64
const TITLE_LINE_HEIGHT = 52

const headerStyle: CSSProperties = {
  height: HEADER_HEIGHT,
  display: 'grid',
  placeItems: 'center',
}

const columnsStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '260px auto',
  marginTop: 28,
  gap: 20,
  justifyContent: 'center',
  alignItems: 'start',
}

function MenuLayout({ title, titleSize = 32, menu, panel, hint }: MenuLayoutProps) {
  return (
    <div style={rootStyle}>
      <div style={{ textAlign: 'center' }}>
        <div style={headerStyle}>
          <h1
            style={{
              font: `700 ${titleSize}px/${TITLE_LINE_HEIGHT}px var(--sans)`,
              color: '#f2f4fb',
              letterSpacing: '-0.02em',
              margin: 0,
            }}
          >
            {title}
          </h1>
        </div>

        <div style={columnsStyle}>
          <div style={{ display: 'grid', gap: 10, alignContent: 'start' }}>{menu}</div>
          {panel}
        </div>

        <p style={{ marginTop: 20, fontSize: 12, color: '#4a5171' }}>{hint}</p>
      </div>
    </div>
  )
}

export { MenuLayout }
