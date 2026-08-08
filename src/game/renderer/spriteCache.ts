/**
 * 스프라이트 이미지 캐시.
 *
 * 렌더러가 물건을 그리려는 순간에 이미지를 불러오면, 그 물건이 **처음 나오는 판**에서는
 * 잠깐 도형 색만 칠해진 채로 떨어진다. 물건이 57종이 되면서 이런 순간이 흔해졌다.
 * 그래서 판이 시작되기 전에 전부 받아둔다.
 *
 * 캐시를 모듈에 두는 이유는 렌더러 인스턴스가 판마다 새로 만들어지기 때문이다.
 * 인스턴스마다 캐시를 들면 미리 받아둔 것을 쓰지 못한다.
 */
const cache = new Map<string, HTMLImageElement>()

/** 그릴 준비가 된 이미지. 아직이면 null — 호출부는 도형 색으로 대신 칠한다 */
function sprite(src: string): HTMLImageElement | null {
  const found = cache.get(src)
  if (found !== undefined) {
    return found.complete && found.naturalWidth > 0 ? found : null
  }
  // 미리 받지 못한 경로가 들어와도 그리기가 멈추면 안 되므로 여기서도 받아둔다
  void load(src)
  return null
}

function load(src: string): Promise<void> {
  /*
   * 브라우저 밖에서는 아무것도 받지 않는다.
   *
   * `game/systems`와 달리 렌더러는 브라우저의 것이지만, 테스트가 렌더러를 세워
   * 한 프레임을 그려보는 일이 있다(`tests/ArenaGlow.test.ts`). 그때 `new Image()`가
   * 없어서 터지면 **그리는 코드가 아니라 이미지 캐시 때문에** 테스트가 죽는다.
   * 그림이 없으면 호출부가 도형 색으로 대신 칠하므로 없는 채로 두면 된다.
   */
  if (typeof Image === 'undefined') {
    return Promise.resolve()
  }
  const found = cache.get(src)
  if (found !== undefined && found.complete) {
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    const image = found ?? new Image()
    if (found === undefined) {
      cache.set(src, image)
    }
    /*
     * 실패해도 resolve한다. 그림 하나를 못 받았다고 게임이 시작되지 않으면
     * 나머지 56종이 멀쩡한데도 아무것도 못 한다 — 그 물건만 도형 색으로 나온다.
     */
    image.onload = () => resolve()
    image.onerror = () => resolve()
    image.src = src
  })
}

/**
 * 전부 미리 받는다. 진행도를 0~1로 알려준다.
 * 순서대로가 아니라 한꺼번에 시작한다 — 브라우저가 알아서 동시 연결 수를 조절한다.
 */
async function preloadSprites(
  sources: readonly string[],
  onProgress?: (ratio: number) => void,
): Promise<void> {
  const unique = [...new Set(sources)]
  if (unique.length === 0) {
    onProgress?.(1)
    return
  }

  let done = 0
  onProgress?.(0)
  await Promise.all(
    unique.map((src) =>
      load(src).then(() => {
        done += 1
        onProgress?.(done / unique.length)
      }),
    ),
  )
}

export { sprite, preloadSprites }
