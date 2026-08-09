#!/usr/bin/env node
/*
 * 아레나 배경·받침대 아트를 게임이 쓸 크기로 줄여 WebP로 낸다.
 *
 *   assets-src/arena/*.png  →  public/arena/*.webp  +  arenaArt.generated.ts
 *
 * `prepare-sprites.cjs`와 나누어 둔 이유는 **하는 일이 다르기 때문**이다. 저쪽은
 * 물건의 실루엣에서 충돌 도형을 뽑아내는 것이 본업이고 산출물의 절반이 도형이다.
 * 아레나 아트에는 충돌 도형이 없다 — 받침대의 물리 상자는 `config.ts`가 정해둔
 * 값이고 그림은 거기에 맞춰 그려질 뿐이다. 그러니 여기서 할 일은 셋뿐이다.
 *
 *   1. 투명 여백을 재서 잘라낸다 (그림의 윗면이 물리 윗면에 맞아야 한다)
 *   2. 화면에서 쓰는 크기로 줄인다
 *   3. WebP로 낸다
 *
 * **자른 자리를 코드가 아니라 생성 파일이 갖는다.** 예전에는 `LOG_CROP` 같은 상수를
 * 렌더러에 손으로 적어두었는데, 그림을 다시 그리면 그 숫자가 조용히 틀려지고
 * 받침대 윗면이 물리와 어긋난다 — 눈으로는 "물건이 살짝 떠 있다"로만 보여서
 * 원인을 찾기 어렵다. 여백은 알파에서 재는 것이므로 기계가 재는 편이 옳다.
 *
 * Node에 이미지 라이브러리가 없어 headless Chrome을 이미지 처리기로 쓴다.
 * `prepare-sprites.cjs`가 이미 같은 이유로 그렇게 한다.
 */

const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright-core')

const ROOT = path.resolve(__dirname, '..')
const SRC_DIR = process.env.ARENA_ROOT ?? path.join(ROOT, 'assets-src', 'arena')
const OUT_DIR = path.join(ROOT, 'public', 'arena')
const GENERATED = path.join(ROOT, 'src', 'game', 'renderer', 'arenaArt.generated.ts')

const OUT_FORMAT = { mime: 'image/webp', quality: 0.9, ext: '.webp' }

/**
 * 무엇을 어떤 크기로 낼 것인가.
 *
 * `maxWidth`는 **화면에서 그려지는 폭의 두 배**를 기준으로 잡았다. 고해상도 화면
 * (dpr 2)에서 흐려지지 않는 최소치이고, 그 위로 올려봐야 용량만 는다.
 *
 * `trim`이 참이면 투명 여백을 재서 잘라낸다. 배경은 불투명이라 잴 것이 없다.
 */
const SOURCES = [
  { name: 'background-day', file: 'background-day.png', maxWidth: 1600, trim: false },
  { name: 'background-night', file: 'background-night.png', maxWidth: 1600, trim: false },
  { name: 'platform-day', file: 'open-storage-box-day.png', maxWidth: 1200, trim: true },
  { name: 'platform-night', file: 'open-storage-box-night.png', maxWidth: 1200, trim: true },
  { name: 'ledge-day', file: 'dust-platform-day.png', maxWidth: 700, trim: true },
  { name: 'ledge-night', file: 'dust-platform-night.png', maxWidth: 700, trim: true },
  // 입력창이 앉는 메모장. 단어를 여기에 적는다
  { name: 'memo-day', file: 'memo-pad-day.png', maxWidth: 900, trim: true },
  { name: 'memo-night', file: 'memo-pad-night.png', maxWidth: 900, trim: true },
  // 치는 동안 글자 끝에 선다
  { name: 'pencil-day', file: 'pencil-day.png', maxWidth: 260, trim: true },
  { name: 'pencil-night', file: 'pencil-night.png', maxWidth: 260, trim: true },
]

/** 이 값 이하의 알파는 없는 것으로 본다. 붓끝의 옅은 자락까지 세면 여백이 안 잘린다 */
const ALPHA_FLOOR = 8

async function render(page, entry) {
  const buffer = fs.readFileSync(path.join(SRC_DIR, entry.file))
  const dataUrl = `data:image/png;base64,${buffer.toString('base64')}`
  return page.evaluate(
    async ({ dataUrl, entry, mime, quality, alphaFloor }) => {
      const image = new Image()
      image.src = dataUrl
      await image.decode()

      let sx = 0
      let sy = 0
      let sw = image.naturalWidth
      let sh = image.naturalHeight

      if (entry.trim) {
        const probe = document.createElement('canvas')
        probe.width = sw
        probe.height = sh
        const pctx = probe.getContext('2d', { willReadFrequently: true })
        pctx.drawImage(image, 0, 0)
        const { data } = pctx.getImageData(0, 0, sw, sh)
        let minX = sw
        let minY = sh
        let maxX = -1
        let maxY = -1
        for (let y = 0; y < sh; y += 1) {
          for (let x = 0; x < sw; x += 1) {
            if (data[(y * sw + x) * 4 + 3] > alphaFloor) {
              if (x < minX) minX = x
              if (x > maxX) maxX = x
              if (y < minY) minY = y
              if (y > maxY) maxY = y
            }
          }
        }
        if (maxX < 0) throw new Error('전부 투명하다')
        sx = minX
        sy = minY
        sw = maxX - minX + 1
        sh = maxY - minY + 1
      }

      const scale = Math.min(1, entry.maxWidth / sw)
      const outW = Math.max(1, Math.round(sw * scale))
      const outH = Math.max(1, Math.round(sh * scale))
      const canvas = document.createElement('canvas')
      canvas.width = outW
      canvas.height = outH
      const ctx = canvas.getContext('2d')
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, outW, outH)

      return {
        dataUrl: canvas.toDataURL(mime, quality),
        width: outW,
        height: outH,
        sourceWidth: image.naturalWidth,
        sourceHeight: image.naturalHeight,
      }
    },
    { dataUrl, entry, mime: OUT_FORMAT.mime, quality: OUT_FORMAT.quality, alphaFloor: ALPHA_FLOOR },
  )
}

async function main() {
  if (!fs.existsSync(SRC_DIR)) {
    console.error(`원본이 없다: ${SRC_DIR}\nARENA_ROOT로 경로를 줄 수 있다.`)
    process.exitCode = 1
    return
  }
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const browser = await chromium.launch({ channel: 'chrome' })
  const page = await browser.newPage()
  const summary = []
  try {
    for (const entry of SOURCES) {
      const result = await render(page, entry)
      const base64 = result.dataUrl.slice(`data:${OUT_FORMAT.mime};base64,`.length)
      const bytes = Buffer.from(base64, 'base64')
      fs.writeFileSync(path.join(OUT_DIR, entry.name + OUT_FORMAT.ext), bytes)
      summary.push({ ...entry, ...result, bytes: bytes.length })
      console.log(
        `${entry.name.padEnd(18)} ${result.sourceWidth}x${result.sourceHeight}` +
          ` → ${result.width}x${result.height}  ${(bytes.length / 1024).toFixed(0)}KB`,
      )
    }
  } finally {
    await browser.close()
  }

  const lines = [
    '/* 자동 생성 — scripts/prepare-arena.cjs. 직접 고치지 말고 스크립트를 다시 돌린다. */',
    '',
    '/**',
    ' * 아레나 아트의 그려지는 크기.',
    ' *',
    ' * 투명 여백은 이미 잘려 있으므로 렌더러는 그림 전체를 그대로 쓰면 된다 —',
    ' * 예전처럼 크롭 상자를 손으로 적어둘 필요가 없다. 가로세로비만 여기서 온다.',
    ' */',
    'interface ArenaArt {',
    '  readonly file: string',
    '  readonly width: number',
    '  readonly height: number',
    '}',
    '',
    'const ARENA_ART = {',
    ...summary.map(
      (item) =>
        `  '${item.name}': { file: '${item.name}${OUT_FORMAT.ext}',` +
        ` width: ${item.width}, height: ${item.height} },`,
    ),
    '} as const satisfies Record<string, ArenaArt>',
    '',
    'type ArenaArtName = keyof typeof ARENA_ART',
    '',
    'export { ARENA_ART }',
    'export type { ArenaArt, ArenaArtName }',
    '',
  ]
  fs.writeFileSync(GENERATED, lines.join('\n'))

  const total = summary.reduce((sum, item) => sum + item.bytes, 0)
  console.log(`\n산출물 ${summary.length}장 · ${(total / 1048576).toFixed(2)}MB`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
