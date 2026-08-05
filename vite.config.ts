import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

/**
 * GitHub Pages는 저장소 이름을 경로로 붙여 서비스하므로 빌드 산출물의 base가 달라진다.
 * 개발 서버는 루트에 그대로 띄운다 — dev URL이 바뀌면 매번 헷갈린다.
 * 런타임에서 만드는 경로(스프라이트)는 `import.meta.env.BASE_URL`을 붙여 맞춘다.
 *
 * preview는 `command`가 'serve'로 오므로 `isPreview`를 함께 봐야 한다.
 * 이걸 빠뜨리면 빌드된 index.html은 /typing-stacker/assets/…를 가리키는데
 * preview 서버는 루트로 서비스해서 전부 404가 된다.
 */
const PAGES_BASE = '/typing-stacker/'

// https://vite.dev/config/
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview === true ? PAGES_BASE : '/',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
}))
