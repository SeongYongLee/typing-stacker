import { createRng } from '../game/systems/Rng.ts'
import type { PlayerId, PlayerInfo } from './protocol.ts'

const DUEL_VISIBLE_TOWERS = 4

function visibleDuelTowerIds({
  players,
  selfId,
  alive,
  seed,
}: {
  readonly players: readonly PlayerInfo[]
  readonly selfId: PlayerId
  readonly alive: ReadonlySet<PlayerId>
  readonly seed: number
}): readonly PlayerId[] {
  const ids = players.map((player) => player.id)
  if (ids.length <= DUEL_VISIBLE_TOWERS) {
    return ids
  }

  const visible: PlayerId[] = []
  if (ids.includes(selfId)) {
    visible.push(selfId)
  }

  const aliveIds = ids.filter((id) => alive.has(id))
  if (aliveIds.length === 1 && aliveIds[0] !== undefined && aliveIds[0] !== selfId) {
    visible.push(aliveIds[0])
  }

  const remaining = ids.filter((id) => !visible.includes(id))
  const rng = createRng(seed)
  for (let index = remaining.length - 1; index > 0; index -= 1) {
    const swapIndex = rng.int(index + 1)
    const current = remaining[index]
    const swap = remaining[swapIndex]
    if (current === undefined || swap === undefined) {
      continue
    }
    remaining[index] = swap
    remaining[swapIndex] = current
  }

  for (const id of remaining) {
    if (visible.length >= DUEL_VISIBLE_TOWERS) {
      break
    }
    visible.push(id)
  }

  return visible
}

export { DUEL_VISIBLE_TOWERS, visibleDuelTowerIds }
