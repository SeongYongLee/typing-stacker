/* 자동 생성 — scripts/prepare-arena.cjs. 직접 고치지 말고 스크립트를 다시 돌린다. */

/**
 * 아레나 아트의 그려지는 크기.
 *
 * 투명 여백은 이미 잘려 있으므로 렌더러는 그림 전체를 그대로 쓰면 된다 —
 * 예전처럼 크롭 상자를 손으로 적어둘 필요가 없다. 가로세로비만 여기서 온다.
 */
interface ArenaArt {
  readonly file: string
  readonly width: number
  readonly height: number
}

const ARENA_ART = {
  'background-day': { file: 'background-day.webp', width: 1600, height: 800 },
  'background-night': { file: 'background-night.webp', width: 1600, height: 800 },
  'platform-day': { file: 'platform-day.webp', width: 1200, height: 245 },
  'platform-night': { file: 'platform-night.webp', width: 1200, height: 245 },
  'ledge-day': { file: 'ledge-day.webp', width: 700, height: 180 },
  'ledge-night': { file: 'ledge-night.webp', width: 700, height: 180 },
  'memo-day': { file: 'memo-day.webp', width: 900, height: 303 },
  'memo-night': { file: 'memo-night.webp', width: 900, height: 302 },
  'pencil-day': { file: 'pencil-day.webp', width: 260, height: 65 },
  'pencil-night': { file: 'pencil-night.webp', width: 260, height: 65 },
} as const satisfies Record<string, ArenaArt>

type ArenaArtName = keyof typeof ARENA_ART

export { ARENA_ART }
export type { ArenaArt, ArenaArtName }
