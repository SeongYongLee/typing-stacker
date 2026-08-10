import { AIM_HALF_RANGE } from '../game/config.ts'
import type { FallingWord } from '../game/types/game.ts'
import {
  MAX_BODIES,
  NICKNAME_MAX,
  parseBodyFrame,
  parseFallingWord,
  sanitizeNickname,
  type BodyFrame,
  type PlayerId,
  type PlayerInfo,
} from '../multi/protocol.ts'
import { COMPETITION_MAX_PLAYERS } from './config.ts'

const MAX_WORDS = 10
const MAX_WELDS = 256
const MAX_LIVES = 3
const MAX_POSITION = 100

type CompetitionMessage =
  | { readonly t: 'cHello'; readonly nickname: string; readonly device: string; readonly icon: string }
  | { readonly t: 'cFull' }
  | { readonly t: 'cRoster'; readonly players: readonly PlayerInfo[] }
  | { readonly t: 'cReady' }
  | { readonly t: 'cReadyList'; readonly ready: readonly PlayerId[] }
  | { readonly t: 'cStart'; readonly seed: number; readonly players: readonly PlayerInfo[] }
  | { readonly t: 'cBye' }
  | { readonly t: 'cDrop'; readonly wordId: number; readonly aimX: number; readonly matchId: string }
  | {
      readonly t: 'cDropped'
      readonly by: PlayerId
      readonly wordId: number
      readonly word: string
      readonly aimX: number
      readonly spawnY: number
      readonly variantId: string
      readonly itemId: number
      readonly applyAtTick: number
      readonly matchId: string
    }
  | {
      readonly t: 'cWords'
      readonly for: PlayerId
      readonly words: readonly FallingWord[]
      readonly matchId: string
    }
  | {
      readonly t: 'cLives'
      readonly lives: readonly (readonly [PlayerId, number])[]
      readonly misses: readonly (readonly [PlayerId, number])[]
      readonly matchId: string
    }
  | {
      readonly t: 'cSync'
      readonly bodies: readonly BodyFrame[]
      readonly welds: readonly (readonly [number, number])[]
      readonly tick: number
      readonly matchId: string
    }
  | { readonly t: 'cLeft'; readonly who: PlayerId; readonly matchId: string }
  | {
      readonly t: 'cOver'
      readonly winner: PlayerId | null
      readonly reason: 'lastAlive' | 'capacity'
      readonly matchId: string
    }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function short(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max
}

function safePositiveInt(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0
}

function matchId(value: unknown): string | null {
  return short(value, 96) ? value : null
}

function deviceId(value: unknown): string {
  return short(value, 64) ? value : ''
}

function iconId(value: unknown): string {
  return typeof value === 'string' && /^[a-z0-9-]{0,40}$/.test(value) ? value : ''
}

function playersOf(value: unknown): PlayerInfo[] | null {
  if (!Array.isArray(value)) return null
  const players: PlayerInfo[] = []
  const ids = new Set<string>()
  for (const raw of value) {
    if (!isRecord(raw) || !short(raw['id'], 64) || ids.has(raw['id'])) return null
    ids.add(raw['id'])
    players.push({
      id: raw['id'],
      nickname: sanitizeNickname(raw['nickname']).slice(0, NICKNAME_MAX),
      device: deviceId(raw['device']),
      icon: iconId(raw['icon']),
    })
    if (players.length > COMPETITION_MAX_PLAYERS) return null
  }
  return players
}

function idsOf(value: unknown): PlayerId[] | null {
  if (!Array.isArray(value) || value.length > COMPETITION_MAX_PLAYERS) return null
  const ids: PlayerId[] = []
  for (const raw of value) {
    if (!short(raw, 64)) return null
    ids.push(raw)
  }
  return ids
}

function countersOf(value: unknown, max: number): [PlayerId, number][] | null {
  if (!Array.isArray(value) || value.length > COMPETITION_MAX_PLAYERS) return null
  const rows: [PlayerId, number][] = []
  for (const raw of value) {
    if (!Array.isArray(raw) || raw.length !== 2) return null
    const [id, count] = raw
    if (!short(id, 64) || !finite(count) || count < 0 || count > max) return null
    rows.push([id, Math.floor(count)])
  }
  return rows
}

function parseCompetitionMessage(raw: unknown): CompetitionMessage | null {
  if (!isRecord(raw) || typeof raw['t'] !== 'string') return null

  switch (raw['t']) {
    case 'cHello':
      return {
        t: 'cHello',
        nickname: sanitizeNickname(raw['nickname']),
        device: deviceId(raw['device']),
        icon: iconId(raw['icon']),
      }
    case 'cFull':
      return { t: 'cFull' }
    case 'cRoster': {
      const players = playersOf(raw['players'])
      return players === null ? null : { t: 'cRoster', players }
    }
    case 'cReady':
      return { t: 'cReady' }
    case 'cReadyList': {
      const ready = idsOf(raw['ready'])
      return ready === null ? null : { t: 'cReadyList', ready }
    }
    case 'cStart': {
      const players = playersOf(raw['players'])
      if (!finite(raw['seed']) || players === null) return null
      return { t: 'cStart', seed: raw['seed'], players }
    }
    case 'cBye':
      return { t: 'cBye' }
    case 'cDrop': {
      const id = matchId(raw['matchId'])
      if (!safePositiveInt(raw['wordId']) || !finite(raw['aimX']) || id === null) return null
      return { t: 'cDrop', wordId: raw['wordId'], aimX: raw['aimX'], matchId: id }
    }
    case 'cDropped': {
      const id = matchId(raw['matchId'])
      if (
        !short(raw['by'], 64) ||
        !safePositiveInt(raw['wordId']) ||
        !short(raw['word'], 20) ||
        !finite(raw['aimX']) ||
        Math.abs(raw['aimX']) > AIM_HALF_RANGE ||
        !finite(raw['spawnY']) ||
        Math.abs(raw['spawnY']) > MAX_POSITION ||
        !short(raw['variantId'], 40) ||
        !safePositiveInt(raw['itemId']) ||
        !Number.isSafeInteger(raw['applyAtTick']) ||
        (raw['applyAtTick'] as number) < 0 ||
        id === null
      ) return null
      return {
        t: 'cDropped',
        by: raw['by'],
        wordId: raw['wordId'],
        word: raw['word'],
        aimX: raw['aimX'],
        spawnY: raw['spawnY'],
        variantId: raw['variantId'],
        itemId: raw['itemId'],
        applyAtTick: raw['applyAtTick'] as number,
        matchId: id,
      }
    }
    case 'cWords': {
      const id = matchId(raw['matchId'])
      if (!short(raw['for'], 64) || !Array.isArray(raw['words']) || raw['words'].length > MAX_WORDS || id === null) return null
      const words: FallingWord[] = []
      for (const entry of raw['words']) {
        const word = parseFallingWord(entry)
        if (word === null) return null
        words.push(word)
      }
      return { t: 'cWords', for: raw['for'], words, matchId: id }
    }
    case 'cLives': {
      const id = matchId(raw['matchId'])
      const lives = countersOf(raw['lives'], MAX_LIVES)
      const misses = countersOf(raw['misses'], Number.MAX_SAFE_INTEGER)
      if (id === null || lives === null || misses === null) return null
      return { t: 'cLives', lives, misses, matchId: id }
    }
    case 'cSync': {
      const id = matchId(raw['matchId'])
      if (
        id === null ||
        !Array.isArray(raw['bodies']) ||
        raw['bodies'].length > MAX_BODIES ||
        !Array.isArray(raw['welds']) ||
        raw['welds'].length > MAX_WELDS ||
        !Number.isSafeInteger(raw['tick']) ||
        (raw['tick'] as number) < 0
      ) return null
      const bodies: BodyFrame[] = []
      const bodyIds = new Set<number>()
      for (const entry of raw['bodies']) {
        const body = parseBodyFrame(entry)
        if (body === null || bodyIds.has(body.itemId)) return null
        bodyIds.add(body.itemId)
        bodies.push(body)
      }
      const welds: [number, number][] = []
      for (const pair of raw['welds']) {
        if (!Array.isArray(pair) || pair.length !== 2) return null
        const [a, b] = pair
        if (!safePositiveInt(a) || !safePositiveInt(b) || a === b || !bodyIds.has(a) || !bodyIds.has(b)) return null
        welds.push(a < b ? [a, b] : [b, a])
      }
      return { t: 'cSync', bodies, welds, tick: raw['tick'] as number, matchId: id }
    }
    case 'cLeft': {
      const id = matchId(raw['matchId'])
      return short(raw['who'], 64) && id !== null
        ? { t: 'cLeft', who: raw['who'], matchId: id }
        : null
    }
    case 'cOver': {
      const id = matchId(raw['matchId'])
      const winner = raw['winner']
      const reason = raw['reason']
      return id !== null &&
        (winner === null || short(winner, 64)) &&
        (reason === 'lastAlive' || reason === 'capacity')
        ? { t: 'cOver', winner: winner as PlayerId | null, reason, matchId: id }
        : null
    }
    default:
      return null
  }
}

export { parseCompetitionMessage }
export type { CompetitionMessage }
