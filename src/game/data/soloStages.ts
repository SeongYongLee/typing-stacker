import { WORDS } from './words.ts'
import { hasAnyTag, type ItemTag } from './itemTags.ts'
import { RECIPES } from './recipes.ts'
import type { DifficultyLevel, WordEntry } from '../types/game.ts'

type SoloStageId = 0 | 1 | 2 | 3 | 4 | 5

interface SoloStage {
  readonly id: SoloStageId
  readonly title: string
  /** 5단계만 엔딩 뒤 계속되는 무한 보관소다. */
  readonly endless: boolean
  /** 화이트보드 반환 목표. 튜토리얼은 별도 흐름이므로 null이다. */
  readonly returnTarget: number | null
  readonly difficulty: DifficultyLevel
  /** 혼잡 경보가 가득 찼을 때 상자에 자동 반입하는 물건 수. */
  readonly congestionDrops: number
  readonly box: { readonly halfWidth: number; readonly wallHeight: number }
  /** 이 스테이지에서 우선 등장하는 단어. 나머지는 보조 풀로 남긴다. */
  readonly featuredWords: readonly string[]
  readonly tags: readonly ItemTag[]
  /** 이 스테이지에서 재료를 보장할 합성 히든 결과 id. */
  readonly hiddenResults: readonly string[]
}

/**
 * 스테이지의 기본 속도는 점수와 무관하다. 실력에 따라 다음 보관함에 빨리 가는 것이 아니라,
 * 화이트보드 반환을 끝내야 다음 규칙으로 넘어간다.
 */
const SOLO_STAGES: readonly SoloStage[] = [
  {
    id: 0,
    title: '처음 온 분실물 보관소',
    endless: false,
    returnTarget: null,
    difficulty: { spawnInterval: 3.2, fallDuration: 11, aimSpeed: 0.34, maxConcurrent: 10 },
    congestionDrops: 0,
    box: { halfWidth: 2.55, wallHeight: 1.6 },
    featuredWords: ['책', '계란', '프라이팬', '토끼', '클로버', '물뿌리개'],
    tags: ['school', 'food'],
    hiddenResults: ['fried-egg'],
  },
  {
    id: 1,
    title: '교실 분실물',
    endless: false,
    returnTarget: 20,
    difficulty: { spawnInterval: 2.6, fallDuration: 8.5, aimSpeed: 0.38, maxConcurrent: 10 },
    congestionDrops: 10,
    box: { halfWidth: 2.4, wallHeight: 1.52 },
    featuredWords: ['책', '색연필세트', '스케치북', '책가방', '연필깎이', '탁상조명'],
    tags: ['school'],
    hiddenResults: ['secret-diary', 'graduation-cap', 'art-bag', 'fart-cloud', 'internet-router'],
  },
  {
    id: 2,
    title: '급식실 보관함',
    endless: false,
    returnTarget: 28,
    difficulty: { spawnInterval: 2.35, fallDuration: 7.5, aimSpeed: 0.42, maxConcurrent: 10 },
    congestionDrops: 13,
    box: { halfWidth: 2.25, wallHeight: 1.44 },
    featuredWords: ['계란', '프라이팬', '피자', '감자튀김', '아이스크림', '마카롱', '우유'],
    tags: ['food'],
    hiddenResults: ['fried-egg', 'salmon-sushi', 'picnic-basket', 'pub-platter', 'dessert-tower'],
  },
  {
    id: 3,
    title: '체육관 장비함',
    endless: false,
    returnTarget: 36,
    difficulty: { spawnInterval: 2.1, fallDuration: 6.5, aimSpeed: 0.46, maxConcurrent: 10 },
    congestionDrops: 16,
    box: { halfWidth: 2.1, wallHeight: 1.36 },
    featuredWords: ['토끼', '거북이', '축구공', '배드민턴채', '운동화', '장난감자동차'],
    tags: ['sports'],
    hiddenResults: ['racing-flag', 'gold-medal', 'speed-course', 'sports-trophy'],
  },
  {
    id: 4,
    title: '잡화·여행 창고',
    endless: false,
    returnTarget: 44,
    difficulty: { spawnInterval: 1.85, fallDuration: 5.5, aimSpeed: 0.5, maxConcurrent: 10 },
    congestionDrops: 19,
    box: { halfWidth: 1.95, wallHeight: 1.28 },
    featuredWords: ['다리미', '세탁기', '카메라', '나침반', '지도', '망원경', '청소기'],
    tags: ['storage', 'travel', 'heavy'],
    hiddenResults: ['glass-shards', 'treasure-chest', 'travel-suitcase', 'vintage-trunk', 'travel-album', 'travel-passport', 'explorer-badge', 'repair-shop', 'cleaning-set', 'survival-kit'],
  },
  {
    id: 5,
    title: '밤의 특수 보관함',
    endless: true,
    returnTarget: 60,
    difficulty: { spawnInterval: 1.6, fallDuration: 4.5, aimSpeed: 0.54, maxConcurrent: 10 },
    congestionDrops: 22,
    box: { halfWidth: 1.84, wallHeight: 1.2 },
    featuredWords: ['별가루', '달', '별똥별', '크리스탈', '촛불', '하트', '클로버'],
    tags: ['glowing', 'magic', 'nature'],
    hiddenResults: ['sunlight', 'mirror-ball', 'heart-ring', 'diamond-ring', 'spaceship', 'spaceship-saucer', 'magic-wand', 'winged-wand', 'lucky-flowerpot', 'terrarium', 'hanging-terrarium', 'snow-globe', 'magic-book', 'mirror-door'],
  },
]

const STAGE_BY_ID = new Map(SOLO_STAGES.map((stage) => [stage.id, stage]))

function soloStage(id: SoloStageId): SoloStage {
  const stage = STAGE_BY_ID.get(id)
  if (stage === undefined) throw new Error(`없는 싱글 스테이지: ${id}`)
  return stage
}

function featuredEntries(stage: SoloStage): readonly WordEntry[] {
  const featured = stage.featuredWords
  const recipeWords = recipeWordsFor(stage.hiddenResults)
  const entries = WORDS.filter((entry) => featured.includes(entry.word) || recipeWords.has(entry.word) || hasAnyTag(entry.word, stage.tags))
  return entries.length > 0 ? entries : WORDS
}

const WORD_FOR_VARIANT = new Map(
  WORDS.flatMap((entry) => entry.variants.map((variant) => [variant.id, entry.word] as const)),
)
const RECIPE_FOR_RESULT = new Map(
  RECIPES.flatMap((recipe) => [recipe.result, ...recipe.hiddenResults].map((variant) => [variant.id, recipe] as const)),
)

/** 결과물부터 거꾸로 따라가, 단어로 직접 낼 수 있는 모든 재료를 모은다. */
function recipeWordsFor(results: readonly string[]): ReadonlySet<string> {
  const words = new Set<string>()
  const visiting = new Set<string>()
  const visit = (id: string): void => {
    const word = WORD_FOR_VARIANT.get(id)
    if (word !== undefined) {
      words.add(word)
      return
    }
    if (visiting.has(id)) return
    visiting.add(id)
    const recipe = RECIPE_FOR_RESULT.get(id)
    recipe?.inputs.forEach(visit)
  }
  results.forEach(visit)
  return words
}

export { SOLO_STAGES, soloStage, featuredEntries, recipeWordsFor }
export type { SoloStage, SoloStageId }
