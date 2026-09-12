import { App } from './App.tsx'
import { lazy, Suspense } from 'react'

const MobileReadability = import.meta.env.DEV
  ? lazy(() => import('./dev/MobileReadability.tsx'))
  : null
const MobilePlay = import.meta.env.DEV ? lazy(() => import('./dev/MobilePlay.tsx')) : null

const ThreePrototype = import.meta.env.DEV ? lazy(() => import('./dev/ThreePrototype.tsx')) : null

function Root() {
  if (ThreePrototype !== null && new URLSearchParams(window.location.search).has('three-prototype')) return <Suspense fallback={null}><ThreePrototype /></Suspense>
  if (MobilePlay !== null && new URLSearchParams(window.location.search).has('mobile-play')) {
    return <Suspense fallback={<p>플레이 준비 중…</p>}><MobilePlay /></Suspense>
  }
  if (MobileReadability !== null && new URLSearchParams(window.location.search).has('mobile-readability')) {
    return <Suspense fallback={<p>미리보기 준비 중…</p>}><MobileReadability /></Suspense>
  }
  return <App />
}

export { Root }
