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
    // Keep local verification responsive; measured simulations use one CPU worker.
    // Vitest's --maxWorkers flag can override this on a dedicated machine.
    maxWorkers: process.env.MEASURE === '1' ? 1 : 2,
    environment: 'node',
    // Default: current product regressions. CI also runs experiments and retained modes.
    include: process.env.TEST_GROUP === 'legacy'
      ? ['tests/legacy/**/*.test.{ts,tsx}']
      : process.env.TEST_GROUP === 'experiments'
        ? ['tests/experiments/**/*.test.{ts,tsx}']
        : process.env.MEASURE === '1'
          ? ['tests/measure/**/*.measure.test.ts']
          : ['tests/**/*.test.{ts,tsx}'],
    exclude: [
      'node_modules/**',
      ...(process.env.MEASURE === '1' ? [] : ['tests/measure/**']),
      ...(!process.env.TEST_GROUP && process.env.MEASURE !== '1'
        ? ['tests/legacy/**', 'tests/experiments/**'] : []),
    ],
  },
}))
