/** 도감·스테이지용 의미 분류다. 물리 충돌음의 material과 섞지 않는다. */
type ItemTag =
  | 'school'
  | 'food'
  | 'sports'
  | 'storage'
  | 'travel'
  | 'heavy'
  | 'glowing'
  | 'nature'
  | 'magic'

const WORD_TAGS: Readonly<Record<string, readonly ItemTag[]>> = {
  책: ['school'], 색연필세트: ['school'], 스케치북: ['school'], 책가방: ['school'], 연필깎이: ['school'], 탁상조명: ['school'],
  계란: ['food'], 프라이팬: ['food'], 피자: ['food'], 감자튀김: ['food'], 아이스크림: ['food'], 마카롱: ['food'], 우유: ['food'], 삼각김밥: ['food'], 도시락: ['food'], 초코도넛: ['food'], 비스킷: ['food'],
  축구공: ['sports'], 배드민턴채: ['sports'], 운동화: ['sports'], 롤러스케이트: ['sports'], 장난감자동차: ['sports'], 장난감기차: ['sports'], 토끼: ['sports', 'nature'], 거북이: ['sports', 'nature'],
  다리미: ['storage', 'heavy'], 세탁기: ['storage', 'heavy'], 청소기: ['storage', 'heavy'], 냉장고: ['storage', 'heavy'], 전자레인지: ['storage', 'heavy'], 카메라: ['storage', 'travel'], 나침반: ['travel'], 지도: ['travel'], 망원경: ['travel'], 종이비행기: ['travel'], 비행기: ['travel'],
  별가루: ['glowing', 'magic'], 달: ['glowing', 'magic'], 별똥별: ['glowing', 'magic'], 크리스탈: ['glowing', 'magic'], 촛불: ['glowing', 'magic'], 하트: ['magic'], 클로버: ['nature', 'magic'], 소나무: ['nature'], 나뭇잎: ['nature'], 버섯: ['nature'], 선인장: ['nature'], 물뿌리개: ['nature'], 씨앗: ['nature'],
}

function tagsOf(word: string): readonly ItemTag[] {
  return WORD_TAGS[word] ?? []
}

function hasAnyTag(word: string, tags: readonly ItemTag[]): boolean {
  return tagsOf(word).some((tag) => tags.includes(tag))
}

export { hasAnyTag, tagsOf, WORD_TAGS }
export type { ItemTag }
