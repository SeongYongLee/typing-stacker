import { App } from './App.tsx'
import { useTooNarrow } from './hooks/useViewport.ts'
import { TooNarrowScreen } from './screens/TooNarrowScreen.tsx'

/**
 * 화면이 좁으면 **앱을 아예 만들지 않는다.**
 *
 * `App` 안에서 갈라도 보이는 것은 같지만, 그러면 판을 못 여는 기기에서도
 * `useGameEngine`이 돌아 **Rapier WASM 1.6MB와 스프라이트 185장을 받는다.**
 * 좁은 화면은 대개 손에 든 기기이고 그쪽이 데이터도 비싸다.
 *
 * 안내를 보다가 창을 넓히면 그때 앱이 만들어진다 — 새로고침이 필요 없다.
 */
function Root() {
  return useTooNarrow() ? <TooNarrowScreen /> : <App />
}

export { Root }
