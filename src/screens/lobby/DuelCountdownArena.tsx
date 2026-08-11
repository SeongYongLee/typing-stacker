import { useLayoutEffect, useMemo, useRef } from 'react'
import { ARENA, LIVES } from '../../game/config.ts'
import { ArenaRenderer } from '../../game/renderer/ArenaRenderer.ts'
import { DUEL_TARGET_STACK_TOP } from '../../multi/MatchEngine.ts'
import { buildOwnerColors } from '../../multi/ownerColors.ts'
import type { PlayerId, PlayerInfo } from '../../multi/protocol.ts'
import { visibleDuelTowerIds } from '../../multi/duelTowers.ts'

interface DuelCountdownArenaProps {
  readonly players: readonly PlayerInfo[]
  readonly selfId: PlayerId
  readonly seed: number
  readonly nightfall: 0 | 1
}

/** 실제 대결 렌더러로 그리는 시작 전 빈 게임판. 물리 엔진은 아직 시작하지 않는다. */
function DuelCountdownArena({ players, selfId, seed, nightfall }: DuelCountdownArenaProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const ownerColors = useMemo(() => buildOwnerColors(players), [players])
  const visiblePlayers = useMemo(() => {
    const alive = new Set(players.map((player) => player.id))
    const visible = visibleDuelTowerIds({ players, selfId, alive, seed })
    return visible.flatMap((id) => {
      const player = players.find((candidate) => candidate.id === id)
      return player === undefined ? [] : [player]
    })
  }, [players, seed, selfId])

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return
    const renderer = new ArenaRenderer(canvas)
    const draw = () => {
      renderer.resize()
      renderer.draw({
        bodies: [],
        aimX: 0,
        showAim: false,
        landing: null,
        nightfall,
        cameraY: 0,
        stackTop: ARENA.platformTop,
        time: 0,
        impacts: [],
        ownerColors,
        duelGoalY: DUEL_TARGET_STACK_TOP,
        duelTowers: visiblePlayers.map((player) => ({
          id: player.id,
          nickname: player.nickname,
          mine: player.id === selfId,
          previewHighlight: player.id === selfId,
          previewDimmed: player.id !== selfId,
          bodies: [],
          aimX: 0,
          showAim: false,
          cameraY: 0,
          stackTop: ARENA.platformTop,
          lives: LIVES,
          result: null,
          exitProgress: 0,
          ownerColors,
        })),
      })
    }
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [nightfall, ownerColors, selfId, visiblePlayers])

  const selfIndex = visiblePlayers.findIndex((player) => player.id === selfId)
  const self = visiblePlayers[selfIndex]

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
      }}
    >
      <canvas
        ref={canvasRef}
        data-duel-countdown-arena
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          display: 'block',
          width: '100%',
          height: '100%',
        }}
      />
      {self !== undefined && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 3,
            display: 'grid',
            gridTemplateColumns: `repeat(${visiblePlayers.length}, minmax(0, 1fr))`,
            gap: 12,
          }}
        >
          <div
            data-countdown-self-position={self.id}
            style={{
              gridColumn: selfIndex + 1,
              placeSelf: 'center stretch',
              minWidth: 0,
              padding: '0 8px',
              textAlign: 'center',
              color: '#f2f4fb',
              fontSize: 22,
              fontWeight: 900,
              lineHeight: 1.15,
              textShadow: '0 3px 12px #0d0f16, 0 0 18px #0d0f16',
            }}
          >
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {self.nickname}
            </div>
            <div style={{ color: '#6bffb0', fontSize: 15, marginTop: 5 }}>내 위치</div>
          </div>
        </div>
      )}
    </div>
  )
}

export { DuelCountdownArena }
