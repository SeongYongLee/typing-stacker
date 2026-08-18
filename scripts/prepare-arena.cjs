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
 *
 * ## `group` — 겹쳐 그릴 것들
 *
 * 상자의 앞/뒤, 시계의 판/바늘처럼 **겹쳐야 하나로 보이는** 그림들이다. 원본에서
 * 같은 캔버스에 그려져 있으므로 같은 사각형에 그리면 저절로 맞는데, **각자 잘라내면
 * 그 맞음이 깨진다** — 앞쪽은 위가 비어 있고 뒤쪽은 아래가 비어 있어서 잘린 양이
 * 서로 다르다.
 *
 * 그래서 같은 묶음은 **합친 경계**로 함께 자르고 같은 배율로 줄인다. 여백은 묶음
 * 바깥쪽만 사라지고 서로의 자리는 그대로 남는다.
 */
const SOURCES = [
  { name: 'background-day', file: 'background-day.png', maxWidth: 1600, trim: false },
  { name: 'background-night', file: 'background-night.png', maxWidth: 1600, trim: false },
  /*
   * 투명 수납함은 **원본(org) → 물건 → 전면(front)** 순서로 겹쳐 그린다.
   * `org`가 상자 전체를 뒤에서 채우고, 가운데가 비어 있는 `front`가 물건 위를
   * 덮는다. 두 이미지는 같은 2048×1024 좌표에 제작됐으므로 반드시 같은 그룹으로
   * 잘라 같은 사각형에 그려야 투명한 벽 사이에 물건이 담긴 것으로 보인다.
   */
  { name: 'platform-back-day', file: 'clear-storage-box-day-org.png', maxWidth: 1200, trim: true, group: 'box' },
  { name: 'platform-front-day', file: 'clear-storage-box-day-front.png', maxWidth: 1200, trim: true, group: 'box' },
  { name: 'platform-back-night', file: 'clear-storage-box-night-org.png', maxWidth: 1200, trim: true, group: 'box' },
  { name: 'platform-front-night', file: 'clear-storage-box-night-front.png', maxWidth: 1200, trim: true, group: 'box' },
  { name: 'ledge-day', file: 'dust-platform-day.png', maxWidth: 700, trim: true },
  { name: 'ledge-night', file: 'dust-platform-night.png', maxWidth: 700, trim: true },
  /*
   * 화이트보드에 적힌 단어를 치면 뻗어 나와 물건을 회수해 가는 손.
   *
   * **낮/밤을 한 묶음으로 자른다.** 둘의 불투명 경계가 세로로 2px 다른데(낮 y118,
   * 밤 y120) 각자 자르면 그만큼 어긋난 채 겹쳐진다 — 겹쳐 쌓는 어법이라 어긋나면
   * 밤에 낮 그림의 테두리가 드러난다.
   *
   * **오른쪽은 이 그림을 좌우로 뒤집어 쓴다.** 그림이 한 벌뿐이라 파이프라인에서
   * 뒤집지 않고 그리는 쪽에서 뒤집는다 — 산출물이 두 배가 되지 않고, 좌우가 늘
   * 같은 그림이라는 것이 코드에 드러난다.
   */
  { name: 'catch-day', file: 'cupped-hands-day.png', maxWidth: 900, trim: true, group: 'catch' },
  { name: 'catch-night', file: 'cupped-hands-night.png', maxWidth: 900, trim: true, group: 'catch' },
  // 입력창이 앉는 메모장. 단어를 여기에 적는다
  { name: 'memo-day', file: 'memo-pad-day.png', maxWidth: 900, trim: true },
  { name: 'memo-night', file: 'memo-pad-night.png', maxWidth: 900, trim: true },
  // 치는 동안 글자 끝에 선다
  { name: 'pencil-day', file: 'pencil-day.png', maxWidth: 260, trim: true },
  { name: 'pencil-night', file: 'pencil-night.png', maxWidth: 260, trim: true },
  /*
   * 시계. 판 위에서 바늘이 돈다 — 바늘의 축이 판의 중심에 맞아야 하므로 한 묶음이다.
   * 아이콘(해/달)은 따로 그려도 되지만 같은 묶음에 두면 자리까지 그림이 정해준다.
   */
  { name: 'timer-dial-day', file: 'timer-dial-day.png', maxWidth: 320, trim: true, group: 'timer' },
  { name: 'timer-hand-day', file: 'timer-hand-day.png', maxWidth: 320, trim: true, group: 'timer' },
  { name: 'timer-dial-night', file: 'timer-dial-night.png', maxWidth: 320, trim: true, group: 'timer' },
  { name: 'timer-hand-night', file: 'timer-hand-night.png', maxWidth: 320, trim: true, group: 'timer' },
  { name: 'timer-icon-day', file: 'timer-icon-day.png', maxWidth: 160, trim: true },
  { name: 'timer-icon-night', file: 'timer-icon-night.png', maxWidth: 160, trim: true },
  /*
   * 벽에 걸린 화이트보드. v1에서는 배경에 그려져 있었는데 v2에서 떨어져 나왔다 —
   * 무언가를 적는 자리로 쓰라는 뜻이다. 적는 일은 다른 데서 정한다.
   */
  { name: 'whiteboard-day', file: 'whiteboard-day.png', maxWidth: 1200, trim: true, group: 'whiteboard' },
  { name: 'whiteboard-night', file: 'whiteboard-night.png', maxWidth: 1200, trim: true, group: 'whiteboard' },
  // 타이틀 화면
  { name: 'title-day', file: 'suspicious-lost-and-found-title-day-final.png', maxWidth: 1600, trim: true },
  { name: 'title-night', file: 'suspicious-lost-and-found-title-night-final.png', maxWidth: 1600, trim: true },
  /*
   * 물건을 놓치면 뛰어들어 물어 가는 고양이(`systems/CatPickup.ts`).
   *
   * **배경이 아닌데 이 파이프라인에 있다.** 여기서 하는 일이 자르고 줄여 WebP로
   * 내는 것뿐이고 고양이에게 필요한 것도 그것뿐이라서다 — 물건 쪽 파이프라인은
   * 실루엣에서 충돌 도형을 뽑는 것이 본업인데 고양이는 부딪히지 않는다.
   *
   * 이름의 left/right는 **들어오는 쪽**이다. `jump-left`는 왼쪽에서 뛰어들어
   * 앞발이 오른쪽을 향한다.
   */
  { name: 'cat-cheese-left', file: 'cat-cheese-jump-left.png', maxWidth: 420, trim: true },
  { name: 'cat-cheese-right', file: 'cat-cheese-jump-right.png', maxWidth: 420, trim: true },
  { name: 'cat-american-shorthair-left', file: 'cat-american-shorthair-jump-left.png', maxWidth: 420, trim: true },
  { name: 'cat-american-shorthair-right', file: 'cat-american-shorthair-jump-right.png', maxWidth: 420, trim: true },
  { name: 'cat-tabby-left', file: 'cat-tabby-jump-left.png', maxWidth: 420, trim: true },
  { name: 'cat-tabby-right', file: 'cat-tabby-jump-right.png', maxWidth: 420, trim: true },
  { name: 'cat-tuxedo-left', file: 'cat-tuxedo-jump-left.png', maxWidth: 420, trim: true },
  { name: 'cat-tuxedo-right', file: 'cat-tuxedo-jump-right.png', maxWidth: 420, trim: true },
]

/** 이 값 이하의 알파는 없는 것으로 본다. 붓끝의 옅은 자락까지 세면 여백이 안 잘린다 */
const ALPHA_FLOOR = 8

/** 불투명한 부분의 경계. 전부 투명하면 null */
async function bounds(page, entry) {
  if (!entry.trim) {
    return null
  }
  const buffer = fs.readFileSync(path.join(SRC_DIR, entry.file))
  const dataUrl = `data:image/png;base64,${buffer.toString('base64')}`
  return page.evaluate(
    async ({ dataUrl, alphaFloor }) => {
      const image = new Image()
      image.src = dataUrl
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(image, 0, 0)
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
      let minX = canvas.width
      let minY = canvas.height
      let maxX = -1
      let maxY = -1
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          if (data[(y * canvas.width + x) * 4 + 3] > alphaFloor) {
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
          }
        }
      }
      if (maxX < 0) throw new Error('전부 투명하다')
      return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
    },
    { dataUrl, alphaFloor: ALPHA_FLOOR },
  )
}

/** 두 경계를 다 감싸는 경계 */
function union(a, b) {
  if (a === null) return b
  if (b === null) return a
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  }
}

async function render(page, entry) {
  const buffer = fs.readFileSync(path.join(SRC_DIR, entry.file))
  const dataUrl = `data:image/png;base64,${buffer.toString('base64')}`
  return page.evaluate(
    async ({ dataUrl, entry, crop, mime, quality }) => {
      const image = new Image()
      image.src = dataUrl
      await image.decode()

      const sx = crop === null ? 0 : crop.x
      const sy = crop === null ? 0 : crop.y
      const sw = crop === null ? image.naturalWidth : crop.width
      const sh = crop === null ? image.naturalHeight : crop.height

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
    { dataUrl, entry, crop: entry.crop ?? null, mime: OUT_FORMAT.mime, quality: OUT_FORMAT.quality },
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
    /*
     * 자를 자리를 먼저 다 재고, 묶음은 합쳐서 하나로 만든다. 그래야 겹쳐 그릴
     * 그림들이 같은 만큼 잘리고 같은 배율로 줄어든다.
     */
    const groups = new Map()
    for (const entry of SOURCES) {
      entry.crop = await bounds(page, entry)
      if (entry.group !== undefined) {
        groups.set(entry.group, union(groups.get(entry.group) ?? null, entry.crop))
      }
    }
    for (const entry of SOURCES) {
      if (entry.group !== undefined) {
        entry.crop = groups.get(entry.group)
      }
    }

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
