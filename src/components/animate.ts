/**
 * 짧은 연출은 상태로 들고 있지 않고 그 자리에서 재생한다 —
 * 엔진이 매 프레임 스냅샷을 밀어 리렌더가 계속 일어나므로,
 * 애니메이션을 state나 CSS transition에 묶으면 진행 중에 끊긴다.
 *
 * 재생 전에 그 요소의 진행 중인 애니메이션을 지운다. 연달아 재생될 때 변형이 겹치지 않게.
 * 반환값은 무한 반복 연출을 나중에 멈추기 위한 핸들이다.
 */
function play(
  element: HTMLElement | null,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
): Animation | null {
  if (element === null || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return null
  }
  for (const running of element.getAnimations()) {
    running.cancel()
  }
  return element.animate(keyframes, options)
}

export { play }
