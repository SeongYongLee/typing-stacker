import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

/**
 * 상대 base는 커스텀 도메인 루트와 기존 GitHub Pages 저장소 경로를 함께 지원한다.
 * 개발 서버는 루트에 그대로 띄우고, 런타임 경로는 `import.meta.env.BASE_URL`에 맞춘다.
 */
const PAGES_BASE = './'

// https://vite.dev/config/
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview === true ? PAGES_BASE : '/',
  plugins: [react()],
  build: {
    /*
     * Rapier -compat는 WASM을 JS 청크에 담아 1.6MB 정도가 된다. 게임 시작에는
     * 필요하지만 앱 본체와 분리해 타이틀 렌더와 브라우저 캐시 경계를 지킨다.
     * 스프라이트 실루엣 좌표도 생성 데이터라 별도 청크로 둔다.
     */
    chunkSizeWarningLimit: 1800,
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/rapier2d-compat')) return 'rapier'
          if (id.includes('/src/game/data/sprites.generated.ts')) return 'sprite-meta'
          if (id.includes('/node_modules/react') || id.includes('/node_modules/react-dom')) {
            return 'react'
          }
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    /*
     * **재는 것은 기본 실행에서 뺀다.**
     *
     * `zz-*.measure`는 고장을 잡는 검사가 아니라 밸런스를 재는 도구다. 봇으로 수십 판을
     * 돌려 표를 찍는 것이라, 단언이라고는 "봇이 아예 못 논다" 수준의 헐거운 것뿐이다.
     * 그런데 그 둘이 **전체 시간의 86%**(157초 중 136초)를 먹었다.
     *
     * 그 대가는 시간만이 아니다. 파일 하나를 고치고 `pnpm test`를 돌릴 때마다 CPU 두
     * 개가 2분씩 붙잡히는데, 이 저장소는 여러 세션이 한 머신을 나눠 쓴다 — 한 사람의
     * 검사가 모두를 느리게 만든다.
     *
     * 재야 할 때는 `pnpm test:measure`로 돌린다. 아트 묶음이 오거나 밸런스 상수를
     * 건드린 뒤가 그때다(까닭은 각 파일 머리말에).
     */
    exclude:
      process.env.MEASURE === '1'
        ? ['node_modules/**']
        : ['node_modules/**', 'tests/**/*.measure.test.ts'],
  },
}))
