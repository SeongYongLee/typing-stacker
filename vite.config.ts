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
