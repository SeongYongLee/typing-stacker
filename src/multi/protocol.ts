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

import type { AuthorityBodyFrame, FallingWord } from '../game/types/game.ts'
import { isMatchMode, isMatchModeChoice, type MatchMode, type MatchModeChoice } from './matchModes.ts'

/**
 * 한 방에 들어올 수 있는 인원.
 *
 * 여덟이 상한인 이유는 **레인 칸**이다. 좌우 다섯 칸씩 열 자리이고, 기다리는 사람이
 * 덫을 걸 단어가 있어야 하므로 사람 수만큼 단어가 필요하다. 그 위로는 레이아웃을
 * 바꿔야 하고, 색도 여덟에서 서로 구분되기를 그친다.
 */
const MAX_PLAYERS = 8

/** 한 번에 받아들일 단어 수. 화면에 뜨는 것보다 넉넉하되 무한히 받지는 않는다 */
const MAX_WORDS = 24

/** 한 번에 받아들일 관절 수. 물건 하나가 여럿에 붙을 수 있어 물건 수보다 넉넉히 둔다 */
const MAX_WELDS = 256
/** 한 키프레임에 허용할 물건 수. 64KB 전송 상한보다 먼저 의미 범위를 제한한다. */
const MAX_BODIES = 128
/** Rapier에 넘기기 전 클라이언트 안정성을 지키는 보수적인 물리 값 범위. */
const MAX_POSITION = 100
const MAX_SPEED = 100
const MAX_ANGULAR_SPEED = 1000
const MAX_SETTLE_TIMER = 60

/** 방 코드 길이. 짧으면 무작위 대입으로 남의 방에 들어올 수 있다 */
const ROOM_CODE_LENGTH = 8

/** 사람이 읽고 불러줄 코드라 0/O, 1/l 처럼 헷갈리는 글자는 뺀다 */
const ROOM_CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

const NICKNAME_MAX = 12

/**
 * 한마디의 최대 길이. 파싱에서 자르는 값이라 `ChatLog`의 것보다 넉넉히 둔다 —
 * 여기서는 "말이 안 되게 긴 것"만 걷어내고, 실제로 화면에 맞춰 자르는 일은 기록이 한다.
 */
const CHAT_MAX = 200

/** 하트가 이보다 많다고 오면 거짓말이다. 회복 수단이 없으므로 처음 값이 상한이다 */
const MAX_LIVES = 16

type PlayerId = string

interface PlayerInfo {
  readonly id: PlayerId
  readonly nickname: string
  /**
   * 이 사람의 아이콘으로 쓸 물건 id. 안 골랐으면 빈 문자열.
   *
   * **물건 표를 보고 거르지 않는다.** 상대가 우리보다 새 물건을 알고 있을 수 있어서,
   * 여기서 모르는 id를 버리면 다음 아트 묶음이 올 때까지 그 사람만 아이콘이 없다.
   * 그리는 쪽이 못 찾으면 빈 자리로 두므로(`Avatar`) 여기서는 모양만 본다.
   */
  readonly icon: string
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
  | {
      readonly t: 'hello'
      readonly nickname: string
      readonly device: string
      readonly icon: string
    }
  /** 준비를 눌렀다. 모두가 누르면 방장이 판을 연다 */
  | { readonly t: 'ready' }
  /** 방장에게 모드 변경을 요청한다. 지금은 방장 UI만 쓰지만 메시지는 검증해 둔다 */
  | { readonly t: 'mode'; readonly matchModeChoice: MatchModeChoice }
  /** 판이 끝난 뒤 계속하기를 눌렀다 */
  | { readonly t: 'rematch'; readonly matchId?: string }
  /** 내 턴에 물건을 떨군다. 방장이 단어와 조준 범위를 검증한다 */
  | { readonly t: 'drop'; readonly word: string; readonly aimX: number; readonly matchId?: string }
  /**
   * 한마디 한다. 방장이 걸러서 모두에게 돌린다.
   *
   * 코드를 주고받아 모인 방에서만 오간다 — 랭크 게임은 서로 모르는 사이라 말을
   * 걸 자리가 아니다. 그 판단은 세션이 하고 여기서는 실어 나르기만 한다.
   */
  | { readonly t: 'chat'; readonly text: string }

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
  | {
      readonly t: 'roster'
      readonly players: readonly PlayerInfo[]
      readonly matchModeChoice?: MatchModeChoice
    }
  /** 지금까지 준비를 누른 사람들. 방장이 정하고 알린다 */
  | { readonly t: 'readyList'; readonly ready: readonly PlayerId[] }
  /** 방장이 모드를 바꿨다. 준비 상태는 함께 풀린다 */
  | { readonly t: 'mode'; readonly matchModeChoice: MatchModeChoice }
  | {
      readonly t: 'start'
      readonly seed: number
      readonly players: readonly PlayerInfo[]
      /** 이 판의 모드. 없으면 구형 클라이언트 호환으로 함께 쌓기다 */
      readonly matchMode: MatchMode
    }
  /** 누가 무엇을 떨궜는지. 양쪽이 같은 물건을 같은 자리에 만들기 위한 것 */
  | {
      readonly t: 'dropped'
      readonly by: PlayerId
      readonly word: string
      readonly aimX: number
      /** 방장이 계산한 생성 높이. 빠지면 구형 클라이언트 호환값을 쓴다 */
      readonly spawnY?: number
      readonly variantId: string
      /** 양쪽이 같은 물건으로 취급하도록 방장이 매기는 번호 */
      readonly itemId: number
      /**
       * 방장이 정한 물리 적용 tick. 있으면 양쪽이 같은 tick에 물건을 만든다.
       * 없으면 구형 클라이언트 호환을 위해 받는 즉시 만든다.
       */
      readonly applyAtTick?: number
      readonly matchId?: string
    }
  /**
   * 누가 무슨 말을 했는지. **한 말은 방장을 거쳐서만 퍼진다.**
   *
   * 그래야 모두가 같은 순서로 보고, 거르는 자리도 하나로 모인다 — 저마다 뿌리면
   * 사람마다 다른 순서로 쌓이고 걸러내는 규칙도 여러 벌이 된다.
   */
  | { readonly t: 'chatted'; readonly from: PlayerId; readonly text: string }
  /**
   * 누가 판에서 빠졌다. 나갔거나 연결이 끊겼거나.
   *
   * 목숨을 0으로 만드는 것은 `lives`로도 되지만 **그것만으로는 이유를 알 수 없다.**
   * 무너져서 탈락한 것과 나가버린 것은 남은 사람에게 다른 소식이고, 화면도 다르게
   * 말해야 한다. 판정은 방장이 하고 참가자는 따른다.
   */
  | { readonly t: 'left'; readonly who: PlayerId; readonly matchId?: string }
  /**
   * 지금 내려오는 단어 밭. 방장이 소유한다.
   *
   * 같은 시드로 양쪽이 각자 굴리는 방법은 쓸 수 없었다 — 난이도가 쌓은 높이를 따라가는데
   * 그 높이는 양쪽에서 미세하게 어긋나고, 그러면 단어가 나오는 순간이 갈린다.
   * 밭이 바뀔 때만 보내므로 흐르는 양은 몇 초에 한 번이다.
   */
  | { readonly t: 'words'; readonly words: readonly FallingWord[]; readonly matchId?: string }
  | { readonly t: 'lives'; readonly lives: readonly (readonly [PlayerId, number])[]; readonly matchId?: string }
  /**
   * 턴이 끝날 때 방장이 보내는 권위 키프레임. 게스트가 여기에 스냅한다.
   *
   * 자리만으로는 부족해서 **붙어 있는 짝**도 함께 보낸다. 끈적함은 양쪽이 각자
   * 접촉을 보고 정하는데, 한 프레임만 어긋나도 한쪽에만 관절이 생기고 그것은
   * 영구적이다 — 자리를 맞춰도 그 뒤로 탑이 다르게 움직인다.
   */
  | {
      readonly t: 'sync'
      readonly bodies: readonly BodyFrame[]
      readonly welds: readonly (readonly [number, number])[]
      /** 이 키프레임이 나온 방장 물리 tick. 구형 메시지에는 없다. */
      readonly tick?: number
      readonly matchId?: string
    }
  | { readonly t: 'over'; readonly winner: PlayerId | null; readonly matchId?: string }
  /** 판이 끝난 뒤 계속하기를 누른 사람들 */
  | { readonly t: 'rematchList'; readonly ready: readonly PlayerId[]; readonly matchId?: string }
  /** 다음 판을 연다. 시드가 바뀌므로 단어도 새로 나온다 */
  | { readonly t: 'restart'; readonly seed: number; readonly matchId?: string }

/**
 * 어느 쪽이든 보낼 수 있는 것.
 * 나가기는 방장도 참가자도 누를 수 있고, 받는 쪽은 "끊긴 것"이 아니라
 * "일부러 나간 것"으로 구분해야 한다 — 안내가 달라진다.
 */
type Either = { readonly t: 'bye' }

type Message = ToHost | ToGuest | Either

type BodyFrame = AuthorityBodyFrame

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isBoundedNumber(value: unknown, maxAbs: number): value is number {
  return isFiniteNumber(value) && Math.abs(value) <= maxAbs
}

function isShortString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max
}

/** 빠진 값은 구형 메시지로 허용하고, 있으면 올바른 문자열만 받는다. */
function optionalShortString(value: unknown, max: number): { matchId?: string } | null {
  if (value === undefined) return {}
  return isShortString(value, max) ? { matchId: value } : null
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
        icon: iconId(raw['icon']),
      }
    case 'drop': {
      if (!isShortString(raw['word'], 20) || !isFiniteNumber(raw['aimX'])) return null
      const matchId = optionalShortString(raw['matchId'], 96)
      if (matchId === null) return null
      return { t: 'drop', word: raw['word'], aimX: raw['aimX'], ...matchId }
    }
    case 'chat':
      if (!isShortString(raw['text'], CHAT_MAX)) return null
      return { t: 'chat', text: raw['text'] }
    case 'welcome':
      if (!isShortString(raw['you'], 64) || !Array.isArray(raw['players'])) return null
      return { t: 'welcome', you: raw['you'], players: parsePlayers(raw['players']) }
    case 'full':
      return { t: 'full' }
    case 'ready':
      return { t: 'ready' }
    case 'mode':
      return isMatchModeChoice(raw['matchModeChoice'])
        ? { t: 'mode', matchModeChoice: raw['matchModeChoice'] }
        : null
    case 'rematch': {
      const matchId = optionalShortString(raw['matchId'], 96)
      return matchId === null ? null : { t: 'rematch', ...matchId }
    }
    case 'bye':
      return { t: 'bye' }
    case 'restart': {
      if (!isFiniteNumber(raw['seed'])) return null
      const matchId = optionalShortString(raw['matchId'], 96)
      return matchId === null ? null : { t: 'restart', seed: raw['seed'], ...matchId }
    }
    case 'rematchList': {
      if (!Array.isArray(raw['ready'])) return null
      const ready: PlayerId[] = []
      for (const id of raw['ready']) {
        if (isShortString(id, 64)) ready.push(id)
        if (ready.length >= MAX_PLAYERS) break
      }
      const matchId = optionalShortString(raw['matchId'], 96)
      return matchId === null ? null : { t: 'rematchList', ready, ...matchId }
    }
    case 'roster':
      if (!Array.isArray(raw['players'])) return null
      return {
        t: 'roster',
        players: parsePlayers(raw['players']),
        matchModeChoice: parseMatchModeChoice(raw['matchModeChoice']),
      }
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
      return {
        t: 'start',
        seed: raw['seed'],
        players: parsePlayers(raw['players']),
        matchMode: isMatchMode(raw['matchMode']) ? raw['matchMode'] : 'shared',
      }
    case 'dropped':
      if (
        !isShortString(raw['by'], 64) ||
        !isShortString(raw['word'], 20) ||
        !isFiniteNumber(raw['aimX']) ||
        !isShortString(raw['variantId'], 40) ||
        !isFiniteNumber(raw['itemId'])
      )
        return null
      if (!Number.isSafeInteger(raw['itemId']) || raw['itemId'] <= 0) return null
      if (raw['spawnY'] !== undefined && !isFiniteNumber(raw['spawnY'])) return null
      if (
        raw['applyAtTick'] !== undefined &&
        (!Number.isSafeInteger(raw['applyAtTick']) || (raw['applyAtTick'] as number) < 0)
      )
        return null
      const droppedMatchId = optionalShortString(raw['matchId'], 96)
      if (droppedMatchId === null) return null
      return {
        t: 'dropped',
        by: raw['by'],
        word: raw['word'],
        aimX: raw['aimX'],
        spawnY: raw['spawnY'],
        variantId: raw['variantId'],
        itemId: raw['itemId'],
        applyAtTick: raw['applyAtTick'] as number | undefined,
        ...droppedMatchId,
      }
    case 'chatted':
      if (!isShortString(raw['from'], 64) || !isShortString(raw['text'], CHAT_MAX)) return null
      return { t: 'chatted', from: raw['from'], text: raw['text'] }
    case 'left': {
      if (!isShortString(raw['who'], 64)) return null
      const matchId = optionalShortString(raw['matchId'], 96)
      return matchId === null ? null : { t: 'left', who: raw['who'], ...matchId }
    }
    case 'words': {
      if (!Array.isArray(raw['words'])) return null
      const words: FallingWord[] = []
      for (const entry of raw['words']) {
        const word = parseFallingWord(entry)
        if (word !== null) words.push(word)
        if (words.length >= MAX_WORDS) break
      }
      const matchId = optionalShortString(raw['matchId'], 96)
      return matchId === null ? null : { t: 'words', words, ...matchId }
    }
    case 'lives': {
      if (!Array.isArray(raw['lives'])) return null
      const lives: [PlayerId, number][] = []
      for (const entry of raw['lives']) {
        if (!Array.isArray(entry) || entry.length !== 2) continue
        const [id, count] = entry
        if (!isShortString(id, 64) || !isFiniteNumber(count)) continue
        /*
         * **반 칸을 버리지 않는다.** 예전에는 Math.floor로 정수로 깎았는데, 노림이
         * 반 칸씩 깎게 된 뒤로 그것이 곧 desync가 됐다 — 방장이 2.5를 보내면 참가자는
         * 2로 읽어 양쪽 하트가 서로 다르게 보였다.
         * 반 칸 단위로만 맞추고 음수와 터무니없는 값만 막는다.
         */
        lives.push([id, Math.max(0, Math.min(Math.round(count * 2) / 2, MAX_LIVES))])
      }
      const matchId = optionalShortString(raw['matchId'], 96)
      return matchId === null ? null : { t: 'lives', lives, ...matchId }
    }
    case 'sync': {
      if (!Array.isArray(raw['bodies']) || raw['bodies'].length > MAX_BODIES) return null
      const bodies: BodyFrame[] = []
      const ids = new Set<number>()
      for (const entry of raw['bodies']) {
        const frame = parseBodyFrame(entry)
        if (frame === null || ids.has(frame.itemId)) return null
        ids.add(frame.itemId)
        bodies.push(frame)
      }
      const welds: [number, number][] = []
      const weldKeys = new Set<string>()
      if (raw['welds'] !== undefined && !Array.isArray(raw['welds'])) return null
      if (Array.isArray(raw['welds'])) {
        if (raw['welds'].length > MAX_WELDS) return null
        for (const entry of raw['welds']) {
          if (!Array.isArray(entry) || entry.length !== 2) return null
          const [rawA, rawB] = entry
          if (!Number.isSafeInteger(rawA) || !Number.isSafeInteger(rawB)) return null
          const a = rawA as number
          const b = rawB as number
          if (a <= 0 || b <= 0 || a === b || !ids.has(a) || !ids.has(b)) return null
          const pair: [number, number] = a < b ? [a, b] : [b, a]
          const key = `${pair[0]}:${pair[1]}`
          if (weldKeys.has(key)) return null
          weldKeys.add(key)
          welds.push(pair)
        }
      }
      const matchId = optionalShortString(raw['matchId'], 96)
      if (matchId === null) return null
      if (
        raw['tick'] !== undefined &&
        (!Number.isSafeInteger(raw['tick']) || (raw['tick'] as number) < 0)
      )
        return null
      return {
        t: 'sync',
        bodies,
        welds,
        tick: raw['tick'] as number | undefined,
        ...matchId,
      }
    }
    case 'over': {
      const winner = raw['winner']
      if (winner !== null && !isShortString(winner, 64)) return null
      const matchId = optionalShortString(raw['matchId'], 96)
      return matchId === null ? null : { t: 'over', winner: winner as PlayerId | null, ...matchId }
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
      icon: iconId(entry['icon']),
    })
    if (players.length >= MAX_PLAYERS) break
  }
  return players
}

function parseBodyFrame(raw: unknown): BodyFrame | null {
  if (!isRecord(raw)) return null
  if (
    !Number.isSafeInteger(raw['itemId']) ||
    (raw['itemId'] as number) <= 0 ||
    !isShortString(raw['variantId'], 40) ||
    !isShortString(raw['owner'], 64) ||
    !isBoundedNumber(raw['x'], MAX_POSITION) ||
    !isBoundedNumber(raw['y'], MAX_POSITION) ||
    !isFiniteNumber(raw['rotation'])
  ) {
    return null
  }
  const base = {
    itemId: raw['itemId'] as number,
    variantId: raw['variantId'],
    owner: raw['owner'],
    x: raw['x'],
    y: raw['y'],
    rotation: raw['rotation'],
  }
  if (raw['stateVersion'] === undefined) {
    const currentOnly = [
      'vx', 'vy', 'angularVelocity', 'sleeping', 'settled', 'anchored', 'lost',
      'settleTimer', 'restX', 'restY', 'previousSpeed', 'dislodged', 'impacted', 'struck',
    ] as const
    return currentOnly.some((key) => raw[key] !== undefined) ? null : base
  }
  if (raw['stateVersion'] !== 1) return null
  if (
    !isBoundedNumber(raw['vx'], MAX_SPEED) ||
    !isBoundedNumber(raw['vy'], MAX_SPEED) ||
    !isBoundedNumber(raw['angularVelocity'], MAX_ANGULAR_SPEED) ||
    !isBoundedNumber(raw['settleTimer'], MAX_SETTLE_TIMER) ||
    (raw['settleTimer'] as number) < 0 ||
    !isBoundedNumber(raw['restX'], MAX_POSITION) ||
    !isBoundedNumber(raw['restY'], MAX_POSITION) ||
    !isBoundedNumber(raw['previousSpeed'], MAX_SPEED) ||
    (raw['previousSpeed'] as number) < 0
  ) {
    return null
  }
  for (const key of [
    'sleeping', 'settled', 'anchored', 'lost', 'dislodged', 'impacted', 'struck',
  ] as const) {
    if (typeof raw[key] !== 'boolean') return null
  }
  return {
    ...base,
    stateVersion: 1,
    vx: raw['vx'],
    vy: raw['vy'],
    angularVelocity: raw['angularVelocity'],
    sleeping: raw['sleeping'] as boolean,
    settled: raw['settled'] as boolean,
    anchored: raw['anchored'] as boolean,
    lost: raw['lost'] as boolean,
    settleTimer: raw['settleTimer'],
    restX: raw['restX'],
    restY: raw['restY'],
    previousSpeed: raw['previousSpeed'],
    dislodged: raw['dislodged'] as boolean,
    impacted: raw['impacted'] as boolean,
    struck: raw['struck'] as boolean,
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

/** 물건 id로 쓸 수 있는 모양인가. 표에 있는지는 그리는 쪽이 본다 */
function iconId(raw: unknown): string {
  return typeof raw === 'string' && /^[a-z0-9-]{1,40}$/.test(raw) ? raw : ''
}

function parseMatchModeChoice(raw: unknown): MatchModeChoice | undefined {
  return isMatchModeChoice(raw) ? raw : undefined
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
  MAX_BODIES,
  ROOM_CODE_LENGTH,
  ROOM_CODE_ALPHABET,
  NICKNAME_MAX,
  CHAT_MAX,
  parseMessage,
  sanitizeNickname,
  createRoomCode,
  isRoomCode,
}
export type { PlayerId, PlayerInfo, ToHost, ToGuest, Message, BodyFrame }
