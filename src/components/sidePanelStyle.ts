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
 * `minHeight`로 두었더니 항목을 오갈 때마다 판이 늘었다 줄었고, 화면 전체가 가운데
 * 정렬이라 **그 변화가 곧 버튼의 위치**가 됐다. 고르려던 것이 손 아래에서 움직이는 셈이다.
 *
 * 값은 **가장 긴 경우를 재서** 정한다. 모자라면 상자가 칸 밖으로 삐져나와 아래의 안내
 * 줄을 덮는다 — 스크롤이 생기는 것이 아니라 그냥 겹친다. 실제로 대전 칸에 순위표가
 * 들어오면서 41px이 넘쳐 안내 줄을 21px 덮었다.
 *
 * 2026-08-09에 브라우저에서 잰 값(상자 높이의 합 + 사이 여백):
 *
 * | 화면·항목 | 내용 높이 |
 * |---|---|
 * | 타이틀 · 함께 하기 | **511** |
 * | 타이틀 · 혼자 하기 | 495 |
 * | 로비 · 랭크 게임 | 396 |
 * | 로비 · 이름 | 388 |
 * | 그 밖 | 55~366 |
 *
 * 가장 큰 511에 여유 한 줄을 얹었다. **항목을 늘리거나 순위 줄을 더 보여주면 다시
 * 재야 한다** — 재는 법은 판 안 두 상자의 높이를 더하는 것이다.
 */
const SIDE_PANEL_HEIGHT = 530

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
