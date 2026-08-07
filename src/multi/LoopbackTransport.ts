import type { Message, PlayerId } from './protocol.ts'
import { parseMessage } from './protocol.ts'
import type { Transport, TransportEvent } from './Transport.ts'

/**
 * 같은 프로세스 안에서 두 쪽을 직접 붙이는 전송로.
 *
 * 테스트 헬퍼가 아니라 `src`에 둔다. 개발용 루프백 화면(`?loopback=1`)이 이걸 그대로 써서
 * 대전 화면·입력·목숨까지 네트워크 없이 확인하기 때문이다 — 테스트와 화면이 같은
 * 전송로를 쓰면 "테스트는 되는데 화면은 안 된다"가 생기지 않는다.
 *
 * WebRTC는 이 환경에서 데이터 채널이 열리지 않아 자동 검증을 할 수 없다(한글 IME와 같은
 * 범주다). 그래서 전송로만 갈아끼워 **우리 로직 전체**를 확인한다 — 핸드셰이크, 턴 교대,
 * 소유권, 목숨, 권위 키프레임이 실제로 오가는지는 여기서 다 드러난다.
 *
 * 실제 경로와 같게 두 가지를 지킨다.
 *  - 보낸 값을 parseMessage에 통과시킨다 — 직렬화를 거치면서 잃는 것이 있으면 여기서 잡힌다
 *  - 전달을 다음 마이크로태스크로 미룬다 — 같은 틱에 도착하면 실제로는 없는 순서가 생긴다
 */
class LoopbackTransport implements Transport {
  readonly selfId: PlayerId
  readonly isHost: boolean
  readonly roomCode: string | null
  private peer: LoopbackTransport | null = null
  private onEvent: ((event: TransportEvent) => void) | null = null
  private closed = false
  /** 오간 메시지 기록. 무엇이 실제로 전송됐는지 검사할 때 쓴다 */
  readonly sent: Message[] = []

  private constructor(selfId: PlayerId, isHost: boolean, roomCode: string | null) {
    this.selfId = selfId
    this.isHost = isHost
    this.roomCode = roomCode
  }

  static pair(
    hostId = 'host-peer',
    guestId = 'guest-peer',
  ): [LoopbackTransport, LoopbackTransport] {
    const host = new LoopbackTransport(hostId, true, 'abcd2345')
    const guest = new LoopbackTransport(guestId, false, 'abcd2345')
    host.peer = guest
    guest.peer = host
    return [host, guest]
  }

  listen(onEvent: (event: TransportEvent) => void): void {
    this.onEvent = onEvent
  }

  peers(): readonly PlayerId[] {
    return this.peer === null || this.closed ? [] : [this.peer.selfId]
  }

  sendTo(_peer: PlayerId, message: Message): void {
    this.deliver(message)
  }

  broadcast(message: Message): void {
    this.deliver(message)
  }

  close(): void {
    this.closed = true
    const peer = this.peer
    this.peer = null
    if (peer !== null) {
      peer.peer = null
      peer.onEvent?.({ kind: 'peerLeft', peer: this.selfId })
    }
  }

  private deliver(message: Message): void {
    if (this.closed || this.peer === null) {
      return
    }
    this.sent.push(message)
    const target = this.peer
    const from = this.selfId
    // 실제 경로처럼 한 틱 뒤에 도착시킨다
    void Promise.resolve().then(() => {
      if (target.closed) {
        return
      }
      // 직렬화를 거친 것처럼 검증 문을 통과시킨다
      const parsed = parseMessage(JSON.parse(JSON.stringify(message)))
      if (parsed !== null) {
        target.onEvent?.({ kind: 'message', from, message: parsed })
      }
    })
  }
}

export { LoopbackTransport }
