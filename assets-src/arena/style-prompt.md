# 수상한 분실물 보관소 — 공통 이미지 생성 프롬프트

아래 프롬프트는 특정 물건이나 화면 배치를 포함하지 않는 공통 스타일 프롬프트입니다. 각 이미지의 고유한 대상·구도 설명 뒤에 필요한 블록을 붙여 사용합니다.

## COMMON STYLE

```text
Use case: stylized-concept
Asset type: 2D game artwork

Create a cozy, slightly mysterious hand-painted 2D game illustration. Build every form from broad, softly imperfect color shapes with gently rounded, subtly smudged edges. Do not use black outlines, ink contours, line art, or crisp vector edges. Keep shapes simplified, chunky, readable, and immediately recognizable at small game-screen sizes. Use medium-low detail and a restrained amount of small decoration.

Use matte painted surfaces with a very subtle gouache or digital-brush texture. Describe light only through changes in hue, value, and soft-edged painted highlights; never draw light rays as hard white lines. Preserve a warm handmade feeling with slightly inaccurate, non-mechanical geometry. Maintain clear silhouettes and sufficient tonal separation for gameplay readability.

Avoid: photorealism, realistic material rendering, 3D render appearance, cel-shaded black borders, comic outlines, thin contour lines, sharp vector geometry, glossy plastic, excessive texture, visual clutter, gradients that look digitally airbrushed, text unless explicitly supplied, logos, watermark, frame, border, mockup presentation, contact sheet, collage, or multiple variants in one image.
```

## DAY LIGHTING

```text
Time variant: DAY.
Use warm late-morning office sunlight with a cozy pale-gold and peach cast, balanced by muted beige, dusty green, faded blue, and soft gray-blue surfaces. Add gentle sunlit patches and soft-edged shadows. Keep the scene bright but not washed out, with moderate contrast and a calm nostalgic office mood. Light must be painted through color and value only.
```

## NIGHT LIGHTING

```text
Time variant: NIGHT.
Preserve the exact same subject geometry, silhouette, camera angle, crop, object count, object placement, proportions, surface details, and texture pattern as the DAY version. Change only lighting, reflected color, and the view or illumination associated with time of day. The room's ceiling fluorescent tubes are switched ON: let their cool blue-violet light wash broadly across the wall and floor, brightest directly beneath the fixture and falling off toward the corners. Use deep indigo and blue-violet for shadow, periwinkle and pale lavender for lit surfaces, and a cool cyan monitor or window glow. Keep a few subdued warm accents so the scene is not monochrome. Use soft pools of light and soft-edged shadows. Do not add, remove, move, resize, rotate, redesign, or relabel anything.
```

**밤은 어둡지 않다.** 형광등이 켜져 있으므로 v1의 "달빛만 드는 남색 방"과 다르다.
실측으로 평균 밝기가 54에서 **106**으로 두 배가 됐고 채도는 25%(낮)에서 **61%**로
올랐다. 잦은 색은 `rgb(0,32,128)`·`rgb(128,128,224)`·`rgb(160,160,224)`다.

이 값은 게임 쪽 전제와 맞물린다 — 밝은 바탕에서는 빛을 더하는 연출(가산 합성)이
보이지 않아서, 밤에도 낮과 같은 처리가 필요해질 수 있다. **밝기를 크게 바꾸려면
알려야 한다**(`src/game/renderer/glow.ts`의 `GLOW_ADDITIVE_NIGHT`).

## TRANSPARENT ASSET OUTPUT

```text
Output preparation: isolate one complete opaque game asset on a perfectly flat solid #ff00ff chroma-key background for local background removal. The background must be exactly one uniform color with no gradient, texture, vignette, lighting variation, reflection, floor plane, cast shadow, contact shadow, or surrounding scene. Keep the full object centered with generous padding and a clean readable silhouette. Do not use #ff00ff or neon magenta anywhere inside the subject. No cropped edges, extra objects, labels, watermark, or presentation frame.
```

## 겹쳐 그리는 것들 — 레이어 분리

```text
Layer separation: when an asset must be composited with gameplay objects between its parts, deliver each layer as a separate file drawn on THE SAME canvas size and position as the others. Do not crop or recenter individual layers. Every pixel must belong to exactly one layer — the layers must not overlap or duplicate each other.
```

| 묶음 | 파일 | 왜 나누나 |
|---|---|---|
| 적재 상자 | `-back` · `-front` | 뒤 → 물건 → 앞으로 그려야 물건이 상자 **안에** 담긴다 |
| 시계 | `dial` · `hand` · `icon` | 바늘이 판 위에서 돌아야 한다 |

**같은 캔버스에 그려야 한다.** 각자 잘라 보내면 서로 어긋나고, 파이프라인이
합친 경계로 함께 자르는 것(`scripts/prepare-arena.cjs`의 `group`)도 소용없어진다.

**나눈 조각의 합이 통짜 그림과 같아야 한다.** v2의 상자는 뒤 221,769px + 앞
351,403px = 573,172px으로 통짜와 정확히 일치했다 — 겹쳐 칠한 화소가 하나도 없다는
뜻이고, 이래야 이어 붙인 자리가 두껍게 보이지 않는다.

**회전하는 조각은 축이 어디인지 알려야 한다.** 시계 바늘의 허브가 판 중심이 아니라
그림 높이의 75.2%에 있어서, 겹쳐만 두면 바늘이 판 아래에 매달렸다. 축을 판 중심에
맞춰 그려주면 받는 쪽이 잴 일이 없다.

## 크로마키를 지운 자리

가장자리에 마젠타가 남는다. 순수 `#ff00ff`는 아니고 `rgb(176,96,224)`처럼 배경과
섞인 **경계 화소**인데, 조각을 나눈 파일일수록 많다(자른 자리마다 새 경계가 생긴다).
실측으로 `pencil-night` 28,490px · `open-storage-box-night-front` 11,685px이었다.

물건 대비 1% 아래라 지금은 그대로 쓰고 있다. 다만 **밤 그림이 낮보다 열 배 넘게
심하고** 밤은 어두워서 밝은 보라가 더 눈에 띈다 — 지울 수 있으면 지우는 편이 낫다.

## 낮/밤 페어 고정 규칙

```text
Pair consistency: the DAY and NIGHT outputs are two lighting states of the same game asset, not two redesigns. Keep pixel-level composition as close as possible. The silhouette, perspective, dimensions, internal seams, dents, brush marks, and decorative placement must remain unchanged; only the illumination and color cast may change.
```
