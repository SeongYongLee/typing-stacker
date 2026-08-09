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
Preserve the exact same subject geometry, silhouette, camera angle, crop, object count, object placement, proportions, surface details, and texture pattern as the DAY version. Change only lighting, reflected color, and the view or illumination associated with time of day. Use deep navy, muted teal, and blue-gray ambient darkness, cool cyan window or monitor glow, and only a few subdued warm amber practical-light accents. Use soft pools of light and soft-edged shadows. Do not add, remove, move, resize, rotate, redesign, or relabel anything.
```

## TRANSPARENT ASSET OUTPUT

```text
Output preparation: isolate one complete opaque game asset on a perfectly flat solid #ff00ff chroma-key background for local background removal. The background must be exactly one uniform color with no gradient, texture, vignette, lighting variation, reflection, floor plane, cast shadow, contact shadow, or surrounding scene. Keep the full object centered with generous padding and a clean readable silhouette. Do not use #ff00ff or neon magenta anywhere inside the subject. No cropped edges, extra objects, labels, watermark, or presentation frame.
```

## 낮/밤 페어 고정 규칙

```text
Pair consistency: the DAY and NIGHT outputs are two lighting states of the same game asset, not two redesigns. Keep pixel-level composition as close as possible. The silhouette, perspective, dimensions, internal seams, dents, brush marks, and decorative placement must remain unchanged; only the illumination and color cast may change.
```
