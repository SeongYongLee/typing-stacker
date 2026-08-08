/**
 * 대전 메시지 규약.
 *
 * 중계 서버는 전달만 하고 내용을 보지 않는다 — **상대가 보낸 것은 전부 거짓일 수 있다**는 전제로
 * 스키마와 값 범위를 여기서 검증한다. 규칙 검증(내 턴인지, 그 단어가 실제로 있었는지)은
 * 상태를 아는 MatchState가 맡는다.
 *
 * 토폴로지는 스타다. 방장이 허브이고 모든 메시지가 방장을 거쳐 재분배되므로
 * 순서가 하나로 정해진다. 2명이든 N명이든 같은 구조다.
 */

import type { FallingWord } from '../game/types/game.ts'

/** 한 방에 들어올 수 있는 인원. 늘리기만 하면 N명이 된다 */
const MAX_PLAYERS = 2

/** 한 번에 받아들일 단어 수. 화면에 뜨는 것보다 넉넉하되 무한히 받지는 않는다 */
const MAX_WORDS = 24

/** 한 번에 받아들일 관절 수. 물건 하나가 여럿에 붙을 수 있어 물건 수보다 넉넉히 둔다 */
const MAX_WELDS = 256

/** 방 코드 길이. 짧으면 무작위 대입으로 남의 방에 들어올 수 있다 */
const ROOM_CODE_LENGTH = 8

/** 사람이 읽고 불러줄 코드라 0/O, 1/l 처럼 헷갈리는 글자는 뺀다 */
const ROOM_CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

const NICKNAME_MAX = 12

type PlayerId = string

interface PlayerInfo {
  readonly id: PlayerId
  readonly nickname: string
  /**
   * 기기 id. 레이팅이 판을 넘어 쌓이려면 이 값이 필요하다 —
   * `id`는 이 판에서만 쓰는 전송로 식별자라 다음 판이면 달라진다.
   *
   * 신원의 증거가 아니라 **기록을 묶는 이름표**다. 상대가 보낸 값이므로 위조할 수
   * 있지만, 레이팅은 양쪽 보고가 일치할 때만 움직이므로 혼자 조작해서 얻을 것이 없다.
   */
  readonly device: string
}

/** 참가자 → 방장 */
type ToHost =
  | { readonly t: 'hello'; readonly nickname: string; readonly device: string }
  /** 준비를 눌렀다. 모두가 누르면 방장이 판을 연다 */
  | { readonly t: 'ready' }
  /** 판이 끝난 뒤 계속하기를 눌렀다 */
  | { readonly t: 'rematch' }
  /** 내 턴에 물건을 떨군다. 방장이 단어와 조준 범위를 검증한다 */
  | { readonly t: 'drop'; readonly word: string; readonly aimX: number }
  /** 상대 턴에 단어를 지목한다 (강제력 없음) */
  | { readonly t: 'suggest'; readonly word: string }

/** 방장 → 참가자 */
type ToGuest =
  | { readonly t: 'welcome'; readonly you: PlayerId; readonly players: readonly PlayerInfo[] }
  | { readonly t: 'full' }
  /**
   * 명단이 정해졌다. 아직 시작은 아니다.
   *
   * 상대가 들어오자마자 판이 시작되면 누구와 붙는지 볼 겨를도, 손을 올릴 겨를도 없다.
   * 그래서 명단을 먼저 알리고 양쪽이 준비를 누르기를 기다린다.
   */
  | { readonly t: 'roster'; readonly players: readonly PlayerInfo[] }
  /** 지금까지 준비를 누른 사람들. 방장이 정하고 알린다 */
  | { readonly t: 'readyList'; readonly ready: readonly PlayerId[] }
  | { readonly t: 'start'; readonly seed: number; readonly players: readonly PlayerInfo[] }
  /** 누가 무엇을 떨궜는지. 양쪽이 같은 물건을 같은 자리에 만들기 위한 것 */
  | {
      readonly t: 'dropped'
      readonly by: PlayerId
      readonly word: string
      readonly aimX: number
      readonly variantId: string
      /** 양쪽이 같은 물건으로 취급하도록 방장이 매기는 번호 */
      readonly itemId: number
    }
  | { readonly t: 'suggested'; readonly by: PlayerId; readonly word: string }
  /**
   * 지금 내려오는 단어 밭. 방장이 소유한다.
   *
   * 같은 시드로 양쪽이 각자 굴리는 방법은 쓸 수 없었다 — 난이도가 쌓은 높이를 따라가는데
   * 그 높이는 양쪽에서 미세하게 어긋나고, 그러면 단어가 나오는 순간이 갈린다.
   * 밭이 바뀔 때만 보내므로 흐르는 양은 몇 초에 한 번이다.
   */
  | { readonly t: 'words'; readonly words: readonly FallingWord[] }
  | { readonly t: 'turn'; readonly current: PlayerId }
  | { readonly t: 'lives'; readonly lives: readonly (readonly [PlayerId, number])[] }
  /** 턴이 끝날 때 방장이 보내는 권위 키프레임. 게스트가 여기에 스냅한다 */
  /**
   * 턴이 끝날 때 방장이 보내는 권위 키프레임. 참가자가 여기에 스냅한다.
   *
   * 자리만으로는 부족해서 **붙어 있는 짝**도 함께 보낸다. 끈적함은 양쪽이 각자
   * 접촉을 보고 정하는데, 한 프레임만 어긋나도 한쪽에만 관절이 생기고 그것은
   * 영구적이다 — 자리를 맞춰도 그 뒤로 탑이 다르게 움직인다.
   *
   * 짝은 **itemId로** 주고받는다. Rapier 핸들은 세계마다 달라 기준이 될 수 없다.
   */
  | {
      readonly t: 'sync'
      readonly bodies: readonly BodyFrame[]
      readonly welds: readonly (readonly [number, number])[]
    }
  | { readonly t: 'over'; readonly winner: PlayerId | null }
  /** 판이 끝난 뒤 계속하기를 누른 사람들 */
  | { readonly t: 'rematchList'; readonly ready: readonly PlayerId[] }
  /** 다음 판을 연다. 시드가 바뀌므로 단어도 새로 나온다 */
  | { readonly t: 'restart'; readonly seed: number }

/**
 * 어느 쪽이든 보낼 수 있는 것.
 * 나가기는 방장도 참가자도 누를 수 있고, 받는 쪽은 "끊긴 것"이 아니라
 * "일부러 나간 것"으로 구분해야 한다 — 안내가 달라진다.
 */
type Either = { readonly t: 'bye' }

type Message = ToHost | ToGuest | Either

interface BodyFrame {
  /** 양쪽이 합의한 물건 식별자. Rapier 핸들은 클라이언트마다 달라 기준이 될 수 없다 */
  readonly itemId: number
  readonly variantId: string
  readonly owner: PlayerId
  readonly x: number
  readonly y: number
  readonly rotation: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isShortString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max
}

function sanitizeNickname(raw: unknown): string {
  if (typeof raw !== 'string') {
    return '이름없음'
  }
  // 줄바꿈·제어문자가 섞이면 화면이 깨진다. 길이도 잘라야 레이아웃이 버틴다
  const cleaned = raw.replace(/[\p{Cc}\p{Cf}]/gu, '').trim()
  return cleaned.length === 0 ? '이름없음' : cleaned.slice(0, NICKNAME_MAX)
}

/**
 * 상대에게서 온 값을 신뢰하기 전에 통과시켜야 하는 문. 모르는 메시지는 버린다.
 * 단어가 실제로 화면에 있었는지 같은 규칙 검증은 여기서 하지 않는다 — 상태를 봐야 한다.
 */
function parseMessage(raw: unknown): Message | null {
  if (!isRecord(raw) || typeof raw['t'] !== 'string') {
    return null
  }

  switch (raw['t']) {
    case 'hello':
      return {
        t: 'hello',
        nickname: sanitizeNickname(raw['nickname']),
        device: deviceId(raw['device']),
      }
    case 'drop':
      if (!isShortString(raw['word'], 20) || !isFiniteNumber(raw['aimX'])) return null
      return { t: 'drop', word: raw['word'], aimX: raw['aimX'] }
    case 'suggest':
      if (!isShortString(raw['word'], 20)) return null
      return { t: 'suggest', word: raw['word'] }
    case 'welcome':
      if (!isShortString(raw['you'], 64) || !Array.isArray(raw['players'])) return null
      return { t: 'welcome', you: raw['you'], players: parsePlayers(raw['players']) }
    case 'full':
      return { t: 'full' }
    case 'ready':
      return { t: 'ready' }
    case 'rematch':
      return { t: 'rematch' }
    case 'bye':
      return { t: 'bye' }
    case 'restart':
      if (!isFiniteNumber(raw['seed'])) return null
      return { t: 'restart', seed: raw['seed'] }
    case 'rematchList': {
      if (!Array.isArray(raw['ready'])) return null
      const ready: PlayerId[] = []
      for (const id of raw['ready']) {
        if (isShortString(id, 64)) ready.push(id)
        if (ready.length >= MAX_PLAYERS) break
      }
      return { t: 'rematchList', ready }
    }
    case 'roster':
      if (!Array.isArray(raw['players'])) return null
      return { t: 'roster', players: parsePlayers(raw['players']) }
    case 'readyList': {
      if (!Array.isArray(raw['ready'])) return null
      const ready: PlayerId[] = []
      for (const id of raw['ready']) {
        if (isShortString(id, 64)) ready.push(id)
        if (ready.length >= MAX_PLAYERS) break
      }
      return { t: 'readyList', ready }
    }
    case 'start':
      if (!isFiniteNumber(raw['seed']) || !Array.isArray(raw['players'])) return null
      return { t: 'start', seed: raw['seed'], players: parsePlayers(raw['players']) }
    case 'dropped':
      if (
        !isShortString(raw['by'], 64) ||
        !isShortString(raw['word'], 20) ||
        !isFiniteNumber(raw['aimX']) ||
        !isShortString(raw['variantId'], 40) ||
        !isFiniteNumber(raw['itemId'])
      )
        return null
      return {
        t: 'dropped',
        by: raw['by'],
        word: raw['word'],
        aimX: raw['aimX'],
        variantId: raw['variantId'],
        itemId: raw['itemId'],
      }
    case 'suggested':
      if (!isShortString(raw['by'], 64) || !isShortString(raw['word'], 20)) return null
      return { t: 'suggested', by: raw['by'], word: raw['word'] }
    case 'words': {
      if (!Array.isArray(raw['words'])) return null
      const words: FallingWord[] = []
      for (const entry of raw['words']) {
        const word = parseFallingWord(entry)
        if (word !== null) words.push(word)
        if (words.length >= MAX_WORDS) break
      }
      return { t: 'words', words }
    }
    case 'turn':
      if (!isShortString(raw['current'], 64)) return null
      return { t: 'turn', current: raw['current'] }
    case 'lives': {
      if (!Array.isArray(raw['lives'])) return null
      const lives: [PlayerId, number][] = []
      for (const entry of raw['lives']) {
        if (!Array.isArray(entry) || entry.length !== 2) continue
        const [id, count] = entry
        if (!isShortString(id, 64) || !isFiniteNumber(count)) continue
        lives.push([id, Math.max(0, Math.floor(count))])
      }
      return { t: 'lives', lives }
    }
    case 'sync': {
      if (!Array.isArray(raw['bodies'])) return null
      const bodies: BodyFrame[] = []
      for (const entry of raw['bodies']) {
        const frame = parseBodyFrame(entry)
        if (frame !== null) bodies.push(frame)
      }
      // 관절이 빠진 옛 키프레임도 받아들인다 — 그 판은 자리만 맞고 구조는 갈린 채로 간다
      const welds: [number, number][] = []
      if (Array.isArray(raw['welds'])) {
        for (const entry of raw['welds']) {
          if (!Array.isArray(entry) || entry.length !== 2) continue
          const [a, b] = entry
          if (!isFiniteNumber(a) || !isFiniteNumber(b)) continue
          welds.push([Math.floor(a), Math.floor(b)])
          if (welds.length >= MAX_WELDS) break
        }
      }
      return { t: 'sync', bodies, welds }
    }
    case 'over': {
      const winner = raw['winner']
      if (winner !== null && !isShortString(winner, 64)) return null
      return { t: 'over', winner: winner as PlayerId | null }
    }
    default:
      return null
  }
}

function parsePlayers(raw: readonly unknown[]): PlayerInfo[] {
  const players: PlayerInfo[] = []
  for (const entry of raw) {
    if (!isRecord(entry) || !isShortString(entry['id'], 64)) continue
    players.push({
      id: entry['id'],
      nickname: sanitizeNickname(entry['nickname']),
      device: deviceId(entry['device']),
    })
    if (players.length >= MAX_PLAYERS) break
  }
  return players
}

function parseBodyFrame(raw: unknown): BodyFrame | null {
  if (!isRecord(raw)) return null
  if (
    !isFiniteNumber(raw['itemId']) ||
    !isShortString(raw['variantId'], 40) ||
    !isShortString(raw['owner'], 64) ||
    !isFiniteNumber(raw['x']) ||
    !isFiniteNumber(raw['y']) ||
    !isFiniteNumber(raw['rotation'])
  ) {
    return null
  }
  return {
    itemId: raw['itemId'],
    variantId: raw['variantId'],
    owner: raw['owner'],
    x: raw['x'],
    y: raw['y'],
    rotation: raw['rotation'],
  }
}

/** 자리·진행도는 화면을 그리는 값이라 범위를 벗어나면 레이아웃이 깨진다. 여기서 가둔다 */
function parseFallingWord(raw: unknown): FallingWord | null {
  if (!isRecord(raw)) return null
  const side = raw['side']
  const state = raw['state']
  if (
    !isFiniteNumber(raw['id']) ||
    !isShortString(raw['word'], 20) ||
    (side !== 'left' && side !== 'right') ||
    !isFiniteNumber(raw['slot']) ||
    !isFiniteNumber(raw['y']) ||
    !isFiniteNumber(raw['fade']) ||
    (state !== 'active' && state !== 'missed')
  ) {
    return null
  }
  return {
    id: Math.floor(raw['id']),
    word: raw['word'],
    side,
    slot: clamp(Math.floor(raw['slot']), 0, MAX_WORDS),
    y: clamp(raw['y'], 0, 1),
    state,
    fade: clamp(raw['fade'], 0, 1),
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** 기기 id. 없거나 이상하면 빈 문자열로 둔다 — 그 판은 레이팅에 반영되지 않는다 */
function deviceId(raw: unknown): string {
  return typeof raw === 'string' && raw.length > 0 && raw.length <= 64 ? raw : ''
}

/** 방 코드. Rng를 주입받아 테스트에서 재현할 수 있게 한다 */
function createRoomCode(next: () => number): string {
  let code = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    const index = Math.floor(next() * ROOM_CODE_ALPHABET.length)
    code += ROOM_CODE_ALPHABET[Math.min(index, ROOM_CODE_ALPHABET.length - 1)]
  }
  return code
}

function isRoomCode(value: string): boolean {
  if (value.length !== ROOM_CODE_LENGTH) return false
  for (const char of value) {
    if (!ROOM_CODE_ALPHABET.includes(char)) return false
  }
  return true
}

export {
  MAX_PLAYERS,
  ROOM_CODE_LENGTH,
  ROOM_CODE_ALPHABET,
  NICKNAME_MAX,
  parseMessage,
  sanitizeNickname,
  createRoomCode,
  isRoomCode,
}
export type { PlayerId, PlayerInfo, ToHost, ToGuest, Message, BodyFrame }
