import { ARENA_ART as GENERATED_ART, type ArenaArtName } from './arenaArt.generated.ts'
import { sprite } from './spriteCache.ts'
import type { ArenaView } from './arenaView.ts'

const ARROW_ART = `${import.meta.env.BASE_URL}arena/stack-drop-arrow.png`

/** 파이프라인이 여백을 잘라둔 것들. 낮/밤이 한 쌍이다 */
function artUrl(name: ArenaArtName): string {
  return `${import.meta.env.BASE_URL}arena/${GENERATED_ART[name].file}`
}

const ARENA_ART_SOURCES = [
  ARROW_ART,
  ...(Object.keys(GENERATED_ART) as ArenaArtName[]).map(artUrl),
]

/**
 * 낮 그림 위에 밤 그림을 `nightfall`만큼 덮어 그린다.
 *
 * 두 그림은 같은 자리에 같은 실루엣으로 그려져 있으므로(에셋 규칙이 그렇다)
 * 겹쳐 놓고 위쪽 알파만 올리면 조명만 넘어간다. 색을 계산해 섞으려 들면 붓질과
 * 그림자까지 뭉개진다 — **덮어 그리는 쪽이 그림이 가진 정보를 지키는 방법이다.**
 */
function drawDayNight(
  view: ArenaView,
  day: ArenaArtName,
  night: ArenaArtName,
  place: (image: HTMLImageElement) => void,
): boolean {
  const dayImage = sprite(artUrl(day))
  if (dayImage === null) {
    return false
  }
  place(dayImage)
  const nightImage = sprite(artUrl(night))
  if (nightImage !== null && view.nightfall > 0) {
    const { ctx } = view
    /*
     * 지금 걸려 있는 알파에 **곱한다.** 덮어쓰면 이 함수를 페이드 안에서 못 쓴다 —
     * 히든 쪽지가 사라지는 중인데 밤 그림만 또렷하게 남는다.
     */
    const base = ctx.globalAlpha
    ctx.globalAlpha = base * view.nightfall
    place(nightImage)
    ctx.globalAlpha = base
  }
  return true
}

export { ARROW_ART, ARENA_ART_SOURCES, artUrl, drawDayNight }
