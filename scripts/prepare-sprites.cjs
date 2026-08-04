/**
 * 스프라이트 준비 파이프라인.
 * Node에 이미지 라이브러리가 없어서 headless Chrome을 이미지 처리기로 쓴다.
 *
 * 1) 불투명 픽셀의 경계로 크롭하고 큰 변 256px로 축소
 * 2) 알파 마스크의 윤곽선을 따라 실루엣 폴리곤을 뽑고 단순화
 * 3) 그 폴리곤을 볼록 조각들로 분해해 compound 콜라이더로 쓸 형태로 저장
 *
 * 볼록껍질 하나로 감싸면 비행기 날개 사이나 번개 지그재그 같은 오목한 부분이
 * 메워져서 빈 공간에서 부딪힌다. 그래서 껍질이 아니라 실루엣을 쓴다.
 *
 * 사용법: node scripts/prepare-sprites.cjs
 *   SPRITE_SRC 환경변수로 원본 폴더를 바꿀 수 있다.
 */
const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright-core')

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const SRC_DIR = process.env.SPRITE_SRC ?? path.join(process.env.HOME, 'Downloads', '이미지 1탄')
const OUT_DIR = path.join(__dirname, '..', 'public', 'items')

const FILES = [
  ['ChatGPT Image 2026년 8월 4일 오후 10_51_24 (1).png', 'airplane'],
  ['ChatGPT Image 2026년 8월 4일 오후 10_51_24 (2).png', 'bento'],
  ['ChatGPT Image 2026년 8월 4일 오후 10_51_24 (3).png', 'bolt'],
  ['ChatGPT Image 2026년 8월 4일 오후 10_51_25 (4).png', 'clover-four'],
  ['ChatGPT Image 2026년 8월 4일 오후 10_51_25 (5).png', 'clover-three'],
  ['ChatGPT Image 2026년 8월 4일 오후 10_51_26 (6).png', 'snail-curled'],
  ['ChatGPT Image 2026년 8월 4일 오후 10_51_26 (7).png', 'snail'],
  ['ChatGPT Image 2026년 8월 4일 오후 10_51_27 (8).png', 'umbrella'],
  ['ChatGPT Image 2026년 8월 4일 오후 10_51_28 (9).png', 'umbrella-folded'],
  ['ChatGPT Image 2026년 8월 4일 오후 10_51_28 (10).png', 'laptop'],
]

const ALPHA_THRESHOLD = 100
const MAX_SIZE = 256
/** 윤곽선 단순화 강도 — 크기 대비 비율 */
const SIMPLIFY_RATIO = 0.012
const MAX_OUTLINE_POINTS = 44
/**
 * 조각 수 상한. 우산 캐노피처럼 물결진 윤곽은 오목한 꼭짓점이 많아 조각이 불어난다.
 * 상한에 걸리면 볼록껍질로 때우면서 정확도를 잃으므로, 그 전에 윤곽선을 더 단순화해
 * 조각 수를 TARGET_PIECES 아래로 떨어뜨린다.
 */
const MAX_PIECES = 40
const TARGET_PIECES = 20

const processInPage = ([
  dataUrl,
  maxSize,
  alphaThreshold,
  simplifyRatio,
  maxOutlinePoints,
  maxPieces,
  targetPieces,
]) =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onerror = () => reject(new Error('image load failed'))
    img.onload = () => {
      try {
        resolve(run(img))
      } catch (error) {
        reject(error)
      }
    }
    img.src = dataUrl

    function run(image) {
      const w = image.naturalWidth
      const h = image.naturalHeight
      const src = document.createElement('canvas')
      src.width = w
      src.height = h
      const sctx = src.getContext('2d')
      sctx.drawImage(image, 0, 0)
      const data = sctx.getImageData(0, 0, w, h).data

      const solid = (x, y) =>
        x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3] >= alphaThreshold

      let minX = w
      let minY = h
      let maxX = -1
      let maxY = -1
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          if (solid(x, y)) {
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
          }
        }
      }
      if (maxX < 0) throw new Error('no opaque pixels')

      const cropW = maxX - minX + 1
      const cropH = maxY - minY + 1

      // ── 1. 윤곽선 추적 (Moore 이웃 경계 따라가기) ────────────────────────
      const outline = traceContour(solid, minX, minY, maxX, maxY)
      if (outline.length < 4) throw new Error('contour too short')

      // ── 2. 단순화 + 3. 볼록 조각으로 분해 ────────────────────────────────
      // 조각이 너무 많이 나오면 윤곽선을 더 뭉개서 다시 시도한다.
      // 상한에 걸려 볼록껍질로 때우는 것보다 윤곽을 조금 단순화하는 쪽이 정확하다.
      let tolerance = Math.max(1, Math.min(cropW, cropH) * simplifyRatio)
      let simplified = null
      let pieces = null
      for (let attempt = 0; attempt < 8; attempt += 1) {
        let candidate = simplify(outline, tolerance)
        while (candidate.length > maxOutlinePoints) {
          tolerance *= 1.25
          candidate = simplify(outline, tolerance)
        }
        if (area(candidate) < 0) candidate.reverse()
        const split = decompose(candidate, maxPieces)
        simplified = candidate
        pieces = split
        if (split.length <= targetPieces) break
        tolerance *= 1.45
      }

      const covered = pieces.reduce((sum, p) => sum + Math.abs(area(p)), 0)
      const target = Math.abs(area(simplified))

      // ── 4. 크롭 박스 기준 -1..1 정규화, y는 위쪽이 + ────────────────────
      const cx = minX + cropW / 2
      const cy = minY + cropH / 2
      const norm = (poly) =>
        poly.map(([x, y]) => [
          Number(((x - cx) / (cropW / 2)).toFixed(4)),
          Number((-(y - cy) / (cropH / 2)).toFixed(4)),
        ])

      const scale = Math.min(maxSize / cropW, maxSize / cropH, 1)
      const outW = Math.max(1, Math.round(cropW * scale))
      const outH = Math.max(1, Math.round(cropH * scale))
      const out = document.createElement('canvas')
      out.width = outW
      out.height = outH
      const octx = out.getContext('2d')
      octx.imageSmoothingQuality = 'high'
      octx.drawImage(image, minX, minY, cropW, cropH, 0, 0, outW, outH)

      return {
        dataUrl: out.toDataURL('image/png'),
        aspect: Number((cropW / cropH).toFixed(4)),
        outW,
        outH,
        outline: norm(simplified),
        pieces: pieces.map(norm),
        coverage: Number((covered / target).toFixed(4)),
        allConvex: pieces.every(isConvex),
      }
    }

    function traceContour(solid, minX, minY, maxX, maxY) {
      // 시작점: 가장 위쪽 행의 가장 왼쪽 불투명 픽셀
      let startX = -1
      let startY = -1
      for (let y = minY; y <= maxY && startX < 0; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          if (solid(x, y)) {
            startX = x
            startY = y
            break
          }
        }
      }
      const dirs = [
        [1, 0],
        [1, 1],
        [0, 1],
        [-1, 1],
        [-1, 0],
        [-1, -1],
        [0, -1],
        [1, -1],
      ]
      const contour = []
      let cx = startX
      let cy = startY
      let dir = 6
      const limit = (maxX - minX + maxY - minY) * 8 + 1000
      for (let step = 0; step < limit; step += 1) {
        contour.push([cx, cy])
        let found = false
        // 이전 방향의 오른쪽부터 시계 반대로 훑는다
        for (let k = 0; k < 8; k += 1) {
          const d = (dir + 6 + k) % 8
          const nx = cx + dirs[d][0]
          const ny = cy + dirs[d][1]
          if (solid(nx, ny)) {
            cx = nx
            cy = ny
            dir = d
            found = true
            break
          }
        }
        if (!found) break
        if (cx === startX && cy === startY && contour.length > 2) break
      }
      return contour
    }

    /** Douglas-Peucker */
    function simplify(points, tolerance) {
      if (points.length <= 3) return points.slice()
      const keep = new Uint8Array(points.length)
      keep[0] = 1
      keep[points.length - 1] = 1
      const stack = [[0, points.length - 1]]
      while (stack.length > 0) {
        const [first, last] = stack.pop()
        let worst = 0
        let index = -1
        for (let i = first + 1; i < last; i += 1) {
          const d = perpendicular(points[i], points[first], points[last])
          if (d > worst) {
            worst = d
            index = i
          }
        }
        if (index >= 0 && worst > tolerance) {
          keep[index] = 1
          stack.push([first, index], [index, last])
        }
      }
      const result = []
      for (let i = 0; i < points.length; i += 1) if (keep[i]) result.push(points[i])
      return result
    }

    function perpendicular(p, a, b) {
      const dx = b[0] - a[0]
      const dy = b[1] - a[1]
      const len = Math.hypot(dx, dy)
      if (len === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
      return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len
    }

    function area(poly) {
      let sum = 0
      for (let i = 0; i < poly.length; i += 1) {
        const [x1, y1] = poly[i]
        const [x2, y2] = poly[(i + 1) % poly.length]
        sum += x1 * y2 - x2 * y1
      }
      return sum / 2
    }

    function cross(o, a, b) {
      return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    }

    function isConvex(poly) {
      if (poly.length < 4) return true
      let sign = 0
      for (let i = 0; i < poly.length; i += 1) {
        const c = cross(
          poly[i],
          poly[(i + 1) % poly.length],
          poly[(i + 2) % poly.length],
        )
        if (Math.abs(c) < 1e-9) continue
        const s = c > 0 ? 1 : -1
        if (sign === 0) sign = s
        else if (s !== sign) return false
      }
      return true
    }

    function segmentsIntersect(p1, p2, p3, p4) {
      const d1 = cross(p3, p4, p1)
      const d2 = cross(p3, p4, p2)
      const d3 = cross(p1, p2, p3)
      const d4 = cross(p1, p2, p4)
      return (
        ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
      )
    }

    /** i-j 대각선이 폴리곤 내부에 온전히 들어있는가 (CCW 가정) */
    function isDiagonal(poly, i, j) {
      const n = poly.length
      if (i === j || (i + 1) % n === j || (j + 1) % n === i) return false
      const a = poly[i]
      const b = poly[j]
      for (let k = 0; k < n; k += 1) {
        const k2 = (k + 1) % n
        if (k === i || k === j || k2 === i || k2 === j) continue
        if (segmentsIntersect(a, b, poly[k], poly[k2])) return false
      }
      // 내부 방향인지: i의 두 이웃이 만드는 쐐기 안에 b가 있어야 한다
      const prev = poly[(i - 1 + n) % n]
      const next = poly[(i + 1) % n]
      const convexVertex = cross(prev, a, next) > 0
      if (convexVertex) {
        return cross(a, b, prev) > 0 && cross(a, b, next) < 0
      }
      return !(cross(a, b, next) > 0 && cross(a, b, prev) < 0)
    }

    /**
     * 오목한 꼭짓점(reflex)을 찾아 대각선으로 잘라내며 볼록 조각들로 나눈다.
     * 자를 곳을 못 찾으면 그 조각만 볼록껍질로 대체한다 (그때만 정확도를 포기).
     */
    /** 이보다 얇은 조각(원본 픽셀 기준)은 버린다 */
    const MIN_PIECE_THICKNESS_PX = 3

    /**
     * 폴리곤의 실질 두께.
     * 면적을 가장 긴 대각선 길이로 나눈 값이라, 대각선으로 누운 얇은 삼각형도 잡아낸다.
     */
    function thickness(poly) {
      let longest = 0
      for (let i = 0; i < poly.length; i += 1) {
        for (let j = i + 1; j < poly.length; j += 1) {
          longest = Math.max(longest, Math.hypot(poly[i][0] - poly[j][0], poly[i][1] - poly[j][1]))
        }
      }
      if (longest === 0) return 0
      return (2 * Math.abs(area(poly))) / longest
    }

    function decompose(poly, maxCount) {
      const output = []
      const queue = [poly]
      while (queue.length > 0) {
        const current = queue.shift()
        if (current.length < 3) continue
        if (output.length + queue.length + 1 >= maxCount || isConvex(current)) {
          output.push(isConvex(current) ? current : convexHull(current))
          continue
        }
        const n = current.length
        let reflex = -1
        for (let i = 0; i < n; i += 1) {
          const prev = current[(i - 1 + n) % n]
          const next = current[(i + 1) % n]
          if (cross(prev, current[i], next) <= 0) {
            reflex = i
            break
          }
        }
        if (reflex < 0) {
          output.push(current)
          continue
        }
        // 가장 균형 있게 나누는 대각선을 고른다
        let bestJ = -1
        let bestScore = -Infinity
        for (let j = 0; j < n; j += 1) {
          if (!isDiagonal(current, reflex, j)) continue
          const size1 = (j - reflex + n) % n
          const size2 = n - size1
          const score = Math.min(size1, size2)
          if (score > bestScore) {
            bestScore = score
            bestJ = j
          }
        }
        if (bestJ < 0) {
          output.push(convexHull(current))
          continue
        }
        const first = []
        for (let k = reflex; ; k = (k + 1) % n) {
          first.push(current[k])
          if (k === bestJ) break
        }
        const second = []
        for (let k = bestJ; ; k = (k + 1) % n) {
          second.push(current[k])
          if (k === reflex) break
        }
        queue.push(first, second)
      }
      // 바늘처럼 얇은 조각은 물리 엔진에서 퇴화 도형이 되어 콜라이더 생성이 실패한다.
      // 바운딩 박스만 보면 대각선으로 누운 얇은 삼각형을 놓치므로 실제 두께를 잰다.
      return output.filter((p) => p.length >= 3 && thickness(p) >= MIN_PIECE_THICKNESS_PX)
    }

    function convexHull(points) {
      const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])
      if (pts.length < 3) return pts
      const lower = []
      for (const p of pts) {
        while (
          lower.length >= 2 &&
          cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
        )
          lower.pop()
        lower.push(p)
      }
      const upper = []
      for (let i = pts.length - 1; i >= 0; i -= 1) {
        const p = pts[i]
        while (
          upper.length >= 2 &&
          cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
        )
          upper.pop()
        upper.push(p)
      }
      return lower.slice(0, -1).concat(upper.slice(0, -1))
    }
  })

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox'],
  })
  const page = await (await browser.newContext()).newPage()
  await page.goto('about:blank')

  const summary = []
  for (const [file, name] of FILES) {
    const buffer = fs.readFileSync(path.join(SRC_DIR, file))
    const dataUrl = 'data:image/png;base64,' + buffer.toString('base64')
    const result = await page.evaluate(processInPage, [
      dataUrl,
      MAX_SIZE,
      ALPHA_THRESHOLD,
      SIMPLIFY_RATIO,
      MAX_OUTLINE_POINTS,
      MAX_PIECES,
      TARGET_PIECES,
    ])

    const base64 = result.dataUrl.replace(/^data:image\/png;base64,/, '')
    const outPath = path.join(OUT_DIR, name + '.png')
    fs.writeFileSync(outPath, Buffer.from(base64, 'base64'))
    const bytes = fs.statSync(outPath).size

    summary.push({ name, ...result, bytes })
    console.log(
      name.padEnd(16),
      (result.outW + 'x' + result.outH).padEnd(9),
      'aspect ' + String(result.aspect).padEnd(7),
      Math.round(bytes / 1024) + 'KB',
      '윤곽 ' + String(result.outline.length).padEnd(3),
      '조각 ' + String(result.pieces.length).padEnd(3),
      '면적 ' + (result.coverage * 100).toFixed(1) + '%',
      result.allConvex ? '' : '⚠ 볼록하지 않은 조각',
    )
  }

  // 얇은 조각을 버리므로 면적이 100%에서 조금 모자랄 수 있다. 부풀어 오르는 쪽(볼록껍질
  // 대체)이 진짜 문제이므로 상한을 좁게 잡는다.
  const bad = summary.filter((s) => !s.allConvex || s.coverage < 0.95 || s.coverage > 1.01)
  if (bad.length > 0) {
    throw new Error(
      '분해 검증 실패: ' + bad.map((s) => `${s.name}(${s.coverage})`).join(', '),
    )
  }

  const fmt = (poly) => '[' + poly.map(([x, y]) => `[${x}, ${y}]`).join(', ') + ']'
  const lines = [
    '// 이 파일은 scripts/prepare-sprites.cjs가 생성한다. 직접 고치지 말 것.',
    '//',
    '// pieces는 원본 스티커의 알파 마스크에서 뽑은 실루엣을 볼록 조각들로 나눈 것이다.',
    '// 볼록껍질 하나로 감싸면 비행기 날개 사이처럼 빈 공간에서 부딪히므로 실루엣을 쓴다.',
    '',
    'interface SpriteMeta {',
    '  /** 가로 / 세로 비율 */',
    '  readonly aspect: number',
    '  /** 그리기용 실루엣 윤곽선. 외접 사각형 기준 -1..1, y는 위쪽이 + */',
    '  readonly outline: readonly (readonly [number, number])[]',
    '  /** 충돌용 볼록 조각들. 좌표계는 outline과 같다 */',
    '  readonly pieces: readonly (readonly (readonly [number, number])[])[]',
    '}',
    '',
    'const SPRITES = {',
  ]
  for (const item of summary) {
    lines.push(`  '${item.name}': {`)
    lines.push(`    aspect: ${item.aspect},`)
    lines.push(`    outline: ${fmt(item.outline)},`)
    lines.push('    pieces: [')
    for (const piece of item.pieces) {
      lines.push(`      ${fmt(piece)},`)
    }
    lines.push('    ],')
    lines.push('  },')
  }
  lines.push('} as const satisfies Record<string, SpriteMeta>')
  lines.push('')
  lines.push('type SpriteName = keyof typeof SPRITES')
  lines.push('')
  lines.push('export { SPRITES }')
  lines.push('export type { SpriteMeta, SpriteName }')
  lines.push('')

  const generated = path.join(__dirname, '..', 'src', 'game', 'data', 'sprites.generated.ts')
  fs.writeFileSync(generated, lines.join('\n'))
  console.log('\n생성:', path.relative(path.join(__dirname, '..'), generated))
  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
