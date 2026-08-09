import type { PlayerId, PlayerInfo } from './protocol.ts'

/**
 * 사라진 사람을 언제까지 기다리고, 방장이 사라지면 누가 이어받는가.
 *
 * **판정만 여기 있고 그 결과로 무엇을 하는지는 엔진이 안다.** 목숨을 깎고 물리를
 * 다시 보내고 화면을 갱신하는 일은 엔진의 것들(match·physics·transport)을 다 쥐고
 * 있어야 하는데, 그것까지 들고 나오면 인자만 열 개가 넘는 자리가 된다.
 *
 * 그래서 이 파일이 아는 것은 **시각과 명단뿐**이다. 그 덕에 node에서 그대로 시험이
 * 돌고, 유예를 몇 초로 할지 방장을 누구로 할지 같은 판단이 한 곳에 모인다.
 */

/**
 * 끊긴 사람을 이만큼 기다렸다 판에서 뺀다(초).
 *
 * 회선이 흔들린 것과 나간 것은 겉으로 같아 보이는데, 바로 빼면 **잠깐 끊긴 사람이
 * 돌아왔을 때 이미 죽어 있다.** 전송로가 다시 붙어보는 시간(18초)보다 길어야 한다.
 */
const REJOIN_GRACE_SEC = 20

class Presence {
  /** 사라졌지만 아직 기다려주는 사람들 → 언제까지(경과 초) */
  private readonly waiting = new Map<PlayerId, number>()
  /** 판 도중에 사라진 사람들. 매 프레임 새로 만들지 않게 바뀔 때만 갈아치운다 */
  private goneView: readonly PlayerId[] = []

  /** 지금 방장. 처음에는 명단 맨 앞이다 */
  private hostId: PlayerId

  constructor(players: readonly PlayerInfo[], fallback: PlayerId) {
    this.hostId = players[0]?.id ?? fallback
  }

  get host(): PlayerId {
    return this.hostId
  }

  get gone(): readonly PlayerId[] {
    return this.goneView
  }

  /** 이 사람을 기다리기 시작한다 */
  await(who: PlayerId, now: number): void {
    this.waiting.set(who, now + REJOIN_GRACE_SEC)
  }

  /** 돌아왔다. 없던 일로 한다 */
  returned(who: PlayerId): void {
    this.waiting.delete(who)
  }

  /** 유예가 지나 이제 판에서 빼야 할 사람들. 돌려주는 순간 목록에서 지운다 */
  expired(now: number): readonly PlayerId[] {
    if (this.waiting.size === 0) {
      return NONE
    }
    const out: PlayerId[] = []
    for (const [who, until] of this.waiting) {
      if (now >= until) {
        out.push(who)
      }
    }
    for (const who of out) {
      this.waiting.delete(who)
    }
    return out
  }

  /** 판에서 빠졌다고 적는다. 무너져 탈락한 것과 다르게 보여주려는 표시다 */
  markGone(who: PlayerId): void {
    if (this.goneView.includes(who)) {
      return
    }
    this.goneView = [...this.goneView, who]
  }

  /**
   * 방장을 넘긴다. **살아 있는 사람 중 명단에서 가장 앞선 사람**이 받는다.
   *
   * 규칙이 단순해야 모두가 같은 답에 이른다 — 그래야 아무도 알리지 않아도 방장이
   * 하나로 정해진다. 정해서 보내면 그 메시지가 늦거나 유실될 때 방장이 둘이 되거나
   * 아무도 아니게 된다.
   *
   * 살아 있는지까지 보는 것은, 이미 탈락한 사람이 심판이 되면 그 사람이 나가는 순간
   * 또 넘겨야 하기 때문이다.
   */
  handOver(
    gone: PlayerId,
    players: readonly PlayerInfo[],
    isAlive: (id: PlayerId) => boolean,
    fallback: PlayerId,
  ): void {
    const next = players.find((player) => player.id !== gone && isAlive(player.id))
    this.hostId = next?.id ?? fallback
  }
}

/** 기다리는 사람이 없을 때 돌려주는 빈 배열 — 매 프레임 새로 만들지 않으려는 것 */
const NONE: readonly PlayerId[] = []

export { Presence, REJOIN_GRACE_SEC }
