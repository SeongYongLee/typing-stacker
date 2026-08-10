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
  'platform-back-day': { file: 'platform-back-day.webp', width: 1200, height: 270 },
  'platform-front-day': { file: 'platform-front-day.webp', width: 1200, height: 270 },
  'platform-back-night': { file: 'platform-back-night.webp', width: 1200, height: 270 },
  'platform-front-night': { file: 'platform-front-night.webp', width: 1200, height: 270 },
  'ledge-day': { file: 'ledge-day.webp', width: 700, height: 203 },
  'ledge-night': { file: 'ledge-night.webp', width: 700, height: 205 },
  'catch-day': { file: 'catch-day.webp', width: 900, height: 864 },
  'catch-night': { file: 'catch-night.webp', width: 900, height: 864 },
  'memo-day': { file: 'memo-day.webp', width: 900, height: 352 },
  'memo-night': { file: 'memo-night.webp', width: 900, height: 354 },
  'pencil-day': { file: 'pencil-day.webp', width: 260, height: 91 },
  'pencil-night': { file: 'pencil-night.webp', width: 260, height: 91 },
  'timer-dial-day': { file: 'timer-dial-day.webp', width: 320, height: 319 },
  'timer-hand-day': { file: 'timer-hand-day.webp', width: 320, height: 319 },
  'timer-dial-night': { file: 'timer-dial-night.webp', width: 320, height: 319 },
  'timer-hand-night': { file: 'timer-hand-night.webp', width: 320, height: 319 },
  'timer-icon-day': { file: 'timer-icon-day.webp', width: 160, height: 161 },
  'timer-icon-night': { file: 'timer-icon-night.webp', width: 160, height: 173 },
  'whiteboard-day': { file: 'whiteboard-day.webp', width: 1200, height: 610 },
  'whiteboard-night': { file: 'whiteboard-night.webp', width: 1200, height: 610 },
  'title-day': { file: 'title-day.webp', width: 1597, height: 510 },
  'title-night': { file: 'title-night.webp', width: 1574, height: 508 },
  'cat-cheese-left': { file: 'cat-cheese-left.webp', width: 420, height: 590 },
  'cat-cheese-right': { file: 'cat-cheese-right.webp', width: 420, height: 590 },
  'cat-american-shorthair-left': { file: 'cat-american-shorthair-left.webp', width: 420, height: 493 },
  'cat-american-shorthair-right': { file: 'cat-american-shorthair-right.webp', width: 420, height: 550 },
  'cat-tabby-left': { file: 'cat-tabby-left.webp', width: 420, height: 465 },
  'cat-tabby-right': { file: 'cat-tabby-right.webp', width: 420, height: 580 },
  'cat-tuxedo-left': { file: 'cat-tuxedo-left.webp', width: 420, height: 483 },
  'cat-tuxedo-right': { file: 'cat-tuxedo-right.webp', width: 420, height: 566 },
} as const satisfies Record<string, ArenaArt>

type ArenaArtName = keyof typeof ARENA_ART

export { ARENA_ART }
export type { ArenaArt, ArenaArtName }
