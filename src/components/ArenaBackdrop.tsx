import type { CSSProperties } from 'react'
import { ARENA_ART } from '../game/renderer/arenaArt.generated.ts'

interface ArenaBackdropProps {
  /** 0 → 낮, 1 → 밤 */
  nightfall: number
}

/**
 * 판 뒤에 깔리는 분실물 보관소.
 *
 * **캔버스가 아니라 DOM이다.** 아레나 캔버스는 `clearRect`로 지워 투명하게 두고
 * 그 뒤를 이 층이 채운다. 캔버스에 그리면 프레임마다 큰 그림을 두 장씩 다시
 * 그리게 되는데, 배경은 한 판 내내 거의 바뀌지 않으므로 그 비용이 통째로 낭비다.
 * DOM에 두면 브라우저가 알아서 합성하고, 낮/밤은 알파 하나만 움직이면 된다.
 *
 * 두 장을 겹쳐두고 **밤의 투명도만** 올린다. 색을 섞어 만들지 않는 이유는
 * `ArenaRenderer.drawDayNight`와 같다 — 두 그림이 같은 구도라 겹치는 것으로 충분하고,
 * 계산해 섞으면 붓질과 그림자가 뭉개진다.
 */
function ArenaBackdrop({ nightfall }: ArenaBackdropProps) {
  return (
    <div aria-hidden style={rootStyle}>
      <div style={layerStyle('background-day', 1)} />
      <div style={layerStyle('background-night', nightfall)} />
    </div>
  )
}

const rootStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  overflow: 'hidden',
  // 캔버스와 레인보다 뒤에 있어야 한다. 뒤에 두는 것만이 이 층이 하는 일이다
  zIndex: 0,
  pointerEvents: 'none',
}

function layerStyle(name: 'background-day' | 'background-night', alpha: number): CSSProperties {
  return {
    position: 'absolute',
    inset: 0,
    backgroundImage: `url(${import.meta.env.BASE_URL}arena/${ARENA_ART[name].file})`,
    /*
     * `cover`로 채운다. 화면비가 그림비(2:1)와 다를 때 여백을 남기지 않으려는 것이고,
     * 잘리는 쪽은 위아래다 — 그림의 좌우 끝(책장·서류함)이 잘리면 방이 좁아 보인다.
     */
    backgroundSize: 'cover',
    backgroundPosition: 'center bottom',
    opacity: alpha,
  }
}

/*
 * **그림을 덮지 않는다.**
 *
 * 한때 여기에 어두운 막을 한 겹 깔았다. 낮 배경이 밝기 149로 지금까지의 단색
 * 배경(15)보다 열 배 밝아서, 가산 합성으로 칠하는 연출(얹힌 색·부스러기)이 그
 * 위에서는 아무것도 하지 못하기 때문이다 — 밝은 바탕에 빛을 더해봐야 보이지 않는다.
 *
 * 막은 그 문제를 **그림을 죽여서** 풀었다. 갈아끼운 뜻이 절반 사라지는 값이라
 * 걷어냈다. 밝은 바탕에서 연출이 보이게 하는 것은 연출 쪽이 풀 문제다 —
 * 낮에는 빛을 더하는 대신 그늘을 지우는 방향으로 가야 한다.
 */

export { ArenaBackdrop }
