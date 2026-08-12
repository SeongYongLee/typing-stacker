import { useEffect, useState } from 'react'
import { soundBoard } from '../audio/SoundBoard.ts'
import { GameEngine, type GameState } from '../game/core/GameEngine.ts'
import { ALL_VARIANTS } from '../game/data/words.ts'
import { ARENA_ART_SOURCES } from '../game/renderer/ArenaRenderer.ts'
import { preloadSprites } from '../game/renderer/spriteCache.ts'
import { loadCollection, saveCollection } from '../storage/collection.ts'

/** 게임에 나오는 모든 그림. 판이 시작되기 전에 이만큼을 받아둔다 */
const SPRITE_SOURCES = [...ALL_VARIANTS.map((item) => item.sprite), ...ARENA_ART_SOURCES]

interface UseGameEngine {
  readonly engine: GameEngine | null
  readonly state: GameState | null
  /** 스프라이트를 받은 비율(0~1). 다 받기 전에는 판을 시작하지 않는다 */
  readonly assetProgress: number
}

/**
 * React는 껍데기이고 게임은 GameEngine이 소유한다.
 * 엔진이 프레임마다 onStateChange로 스냅샷을 밀어주고, React는 그것만 그린다.
 */
function useGameEngine(enabled: boolean): UseGameEngine {
  const [engine, setEngine] = useState<GameEngine | null>(null)
  const [state, setState] = useState<GameState | null>(null)
  const [assetProgress, setAssetProgress] = useState(0)

  /*
   * 그림을 미리 다 받아둔다.
   *
   * 렌더러는 그리려는 순간에 이미지를 불러오므로, 미리 받지 않으면 그 물건이
   * 처음 나오는 판에서 도형 색만 칠해진 채로 떨어진다. 물건이 57종이 되면서
   * 판마다 처음 보는 물건이 여럿 나온다.
   */
  useEffect(() => {
    if (!enabled) {
      return
    }
    let disposed = false
    void preloadSprites(SPRITE_SOURCES, (ratio) => {
      if (!disposed) {
        setAssetProgress(ratio)
      }
    })
    return () => {
      disposed = true
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      return
    }
    let disposed = false
    let created: GameEngine | null = null

    // 시드 자체는 매 세션 달라야 하므로 경계에서만 시간을 쓴다.
    // 시드가 정해진 뒤로는 모든 난수가 재현 가능하다 (1대1 멀티 대비).
    // 도감은 판을 넘어 남는다. 저장소를 아는 것은 이 경계뿐이다
    void GameEngine.create(Date.now() >>> 0, loadCollection()).then((instance) => {
      if (disposed) {
        instance.dispose()
        return
      }
      created = instance
      instance.onStateChange(setState)
      instance.onCollectionChange(saveCollection)
      // 엔진은 소리를 모른다. 사건을 소리로 바꾸는 것은 이 경계의 일이다
      instance.onEvent((event) => soundBoard().handle(event))
      setEngine(instance)
    })

    return () => {
      disposed = true
      created?.dispose()
      setEngine(null)
    }
  }, [enabled])

  useEffect(() => {
    if (engine === null) {
      return
    }
    const onResize = () => engine.handleResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [engine])

  return { engine, state, assetProgress }
}

export { useGameEngine }
