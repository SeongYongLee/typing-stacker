import type { CSSProperties } from 'react'

/**
 * 판의 크기와 상자 모양.
 *
 * 컴포넌트 파일 밖에 두는 이유는 한 파일이 컴포넌트와 상수를 함께 내보내면 Fast
 * Refresh가 그 파일을 통째로 다시 만들기 때문이다. 다른 화면이 이 값을 가져다 쓰는
 * 만큼, 값만 사는 자리가 따로 있어야 한다.
 */
const SIDE_PANEL_WIDTH = 300

/**
 * 기둥의 높이를 못 박는다.
 *
 * `minHeight`로 두었더니 항목을 오갈 때마다 판이 늘었다 줄었고, 판이 메뉴보다 크므로
 * **그 변화가 곧 버튼의 위치**가 됐다. 고르려던 것이 손 아래에서 움직이는 셈이다.
 *
 * 값은 **가장 긴 경우를 재서** 정한다 — 순위 다섯 줄이 긴 이름(쌓아올린 크리스마스트리)과
 * 일곱 자리 점수로 가득 찬 혼자 하기가 459px(260 + 12 + 187)이었다. 이보다 낮으면
 * 상자 안에 스크롤이 생기는데, 굴려야 보이는 순위는 없는 것과 같다.
 */
const SIDE_PANEL_HEIGHT = 470

/**
 * 기록과 설명은 **다른 상자**에 담고, **기록이 위**다.
 *
 * 한 상자에 선만 그어 나눠봤더니 "이 게임은 이렇게 하는 것이다"와 "지금 내 기록은
 * 이렇다"가 한 덩어리로 읽혔다. 앞은 판마다 달라지는 것이고 뒤는 한 번 읽고 마는
 * 것이라, 상자를 갈라 눈이 둘을 다른 종류로 받게 한다. 바뀌는 쪽이 위에 있어야
 * 다시 올 때마다 눈이 같은 자리에서 새 값을 만난다.
 */
const panelColumnStyle: CSSProperties = {
  width: SIDE_PANEL_WIDTH,
  height: SIDE_PANEL_HEIGHT,
  display: 'grid',
  // 두 상자 모두 제 내용만큼만 차지한다. 늘려 채우면 한 줄짜리 설명이 빈 상자로 보인다
  gridTemplateRows: 'auto auto',
  alignContent: 'start',
  gap: 12,
  textAlign: 'left',
}

/**
 * 상자 안에는 스크롤을 두지 않는다.
 *
 * 굴려야 보이는 것은 없는 것과 같다 — 순위를 훑는 사람은 스크롤바를 찾지 않는다.
 * 그래서 기둥 높이를 가장 긴 경우가 그대로 들어가는 값으로 잡아뒀다.
 */
const panelBoxStyle: CSSProperties = {
  padding: '16px 18px',
  border: '1px solid #262b3d',
  borderRadius: 12,
  background: '#151824',
}

/** 상자 안 칸의 머리 */
const panelTitleStyle: CSSProperties = {
  fontSize: 12,
  color: '#6a7290',
  letterSpacing: '0.08em',
  margin: '0 0 14px',
}

export {
  panelColumnStyle,
  panelBoxStyle,
  panelTitleStyle,
  SIDE_PANEL_WIDTH,
  SIDE_PANEL_HEIGHT,
}
