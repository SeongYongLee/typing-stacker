import type { OwnerId } from '../game/types/game.ts'
import type { PlayerInfo } from './protocol.ts'

/**
 * 플레이어를 색으로 구분한다. 인덱스로 뽑으므로 인원이 늘어도 그대로 쓴다.
 *
 * 색만으로 구분하지 않는 것이 원칙이지만(색각 이상), 물건 위에 이름을 얹으면
 * 스택이 글자로 뒤덮인다. 그래서 색은 물건 윤곽에만 쓰고, 누가 무슨 색인지는
 * 화면 위쪽 이름표에 같은 색 점을 붙여 대조할 수 있게 한다.
 */
/*
 * 여덟까지 붙을 수 있으므로 여덟 색을 둔다. 이보다 늘리면 서로 구분되지 않는다 —
 * 색만으로 구분하지 않는다는 원칙이 있어도, 물건 테두리는 색 말고 쓸 것이 없다.
 *
 * 순서는 **이웃끼리 가장 멀어지도록** 색상환을 건너뛰며 놓았다. 둘이 붙는 판이
 * 가장 흔하므로 처음 둘(파랑·주황)이 가장 크게 갈린다.
 */
const PALETTE = [
  '#6ba7ff', // 파랑
  '#ff8b6b', // 주황
  '#6bffb0', // 초록
  '#d78bff', // 보라
  '#ffd76b', // 노랑
  '#ff6b9f', // 분홍
  '#6bf0ff', // 하늘
  '#b6ff6b', // 연두
] as const

function ownerColorAt(index: number): string {
  return PALETTE[index % PALETTE.length] ?? PALETTE[0]
}

function buildOwnerColors(players: readonly PlayerInfo[]): Map<OwnerId, string> {
  const colors = new Map<OwnerId, string>()
  players.forEach((player, index) => {
    colors.set(player.id, ownerColorAt(index))
  })
  return colors
}

export { PALETTE, ownerColorAt, buildOwnerColors }
