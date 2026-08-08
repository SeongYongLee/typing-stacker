import type { CSSProperties } from 'react'
import { VARIANT_BY_ID } from '../game/data/words.ts'

/**
 * 사람을 가리키는 아이콘 — 도감에서 고른 물건 그림.
 *
 * 순위표·대기방·판 안에서 같은 것을 쓴다. 크기만 다르고 규칙은 하나여야 한다 —
 * 자리마다 따로 그리면 못 고른 사람이 한쪽에서는 빈칸으로, 다른 쪽에서는 물음표로
 * 보인다.
 *
 * **모르는 id는 조용히 넘긴다.** 아이콘은 상대가 보내오기도 하는데(대전), 그쪽이
 * 우리보다 새 물건을 알고 있을 수 있다. 그때 화면이 깨지는 것보다 아이콘 없이 이름만
 * 보이는 편이 낫다.
 */
interface AvatarProps {
  /** 물건 id. 빈 문자열이거나 모르는 id면 빈 자리로 그린다 */
  icon: string
  size: number
  /** 테두리 색. 대전에서는 그 사람의 색을 쓴다 */
  ring?: string
}

function Avatar({ icon, size, ring }: AvatarProps) {
  const sprite = VARIANT_BY_ID.get(icon)?.sprite ?? null

  const base: CSSProperties = {
    width: size,
    height: size,
    flexShrink: 0,
    borderRadius: '50%',
    background: '#12151f',
    border: `1px solid ${ring ?? '#2e3448'}`,
    display: 'grid',
    placeItems: 'center',
    overflow: 'hidden',
  }

  return (
    <span style={base} data-avatar={sprite === null ? 'none' : icon}>
      {sprite !== null && (
        <img
          src={sprite}
          alt=""
          /*
           * 동그란 칸에 맞추려면 조금 줄여야 한다. 꽉 채우면 세로로 긴 물건(텀블러,
           * 번개)의 위아래가 테두리에 잘린다 — 무엇인지 알아보라고 두는 그림이다.
           */
          style={{ width: size * 0.78, height: size * 0.78, objectFit: 'contain' }}
        />
      )}
    </span>
  )
}

export { Avatar }
