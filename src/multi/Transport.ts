import type { Message, PlayerId } from './protocol.ts'

/**
 * 대전 연결을 어떻게 맺는지를 숨기는 층.
 *
 * 지금은 중계 서버(WebSocket)를 쓴다. 이 층이 있어서 시험용 루프백으로 갈아끼울 수 있고,
 * 그 덕에 서버 없이도 핸드셰이크부터 판 전체를 자동 검증한다.
 *
 * 토폴로지는 스타다 — 방장이 허브가 되어 모든 참가자와 개별 연결을 맺는다.
 * 그래서 방장을 거치면 메시지 순서가 하나로 정해지고, 인원이 늘어도 구조가 같다.
 */
interface Transport<TMessage = Message> {
  /** 나에게 배정된 식별자 */
  readonly selfId: PlayerId
  /** 참가자가 들어올 때 쓸 방 코드. 방장만 값을 가진다 */
  readonly roomCode: string | null
  readonly isHost: boolean
  /** 권위 참가자의 전송로 id. 참가자용 메시지의 발신자를 검증한다. */
  readonly hostId: PlayerId
  /** 지금 붙어 있는 상대들 */
  peers(): readonly PlayerId[]
  /** 특정 상대에게. 방장이 개별 응답할 때 쓴다 */
  sendTo(peer: PlayerId, message: TMessage): void
  /** 붙어 있는 모두에게 */
  broadcast(message: TMessage): void
  close(): void
}

type TransportEvent<TMessage = Message> =
  | { readonly kind: 'peerJoined'; readonly peer: PlayerId }
  /**
   * 끊겼고 다시 붙는 중이다. **실패가 아니다** — 화면은 판을 접지 말고 기다린다고 말한다.
   *
   * 사람이 회선이 흔들린 것과 판이 끝난 것을 구분할 수 있어야 한다. 그 둘에 할 수
   * 있는 일이 다르다(기다리기 vs 나가기).
   */
  | { readonly kind: 'reconnecting'; readonly attempt: number }
  /** 다시 붙었고 쓰던 이름표를 되찾았다. 받는 쪽은 여기서 상태를 다시 맞춘다 */
  | { readonly kind: 'resumed' }
  | { readonly kind: 'peerLeft'; readonly peer: PlayerId }
  | { readonly kind: 'message'; readonly from: PlayerId; readonly message: TMessage }
  | { readonly kind: 'error'; readonly failure: TransportFailure }

interface TransportHandlers<TMessage = Message> {
  onEvent(event: TransportEvent<TMessage>): void
}

/**
 * 연결이 안 될 이유는 여러 가지고, 각각 사용자에게 할 말이 다르다.
 * "연결 실패"만 띄우면 코드를 잘못 쳤는지 브로커가 죽었는지 알 수 없다.
 */
type TransportFailureKind =
  /** 그 방 코드로 기다리는 사람이 없다 */
  | 'roomNotFound'
  /** 방이 정원을 채웠다 */
  | 'roomFull'
  /** 중계 서버에 닿지 못했다 */
  | 'brokerUnreachable'
  /** 상대와의 연결이 끊겼다 */
  | 'peerLost'
  /**
   * 붙기는 했는데 시작 신호가 오가지 않았다.
   * 경로가 안 열린 것과 구분해야 한다 — 이쪽은 연결 문제가 아니라 한쪽이 응답하지
   * 않는 것이고, 타임아웃이 없으면 양쪽이 영원히 기다린다.
   */
  | 'handshakeStalled'
  /**
   * 붙었는데 상대가 준비를 누르지 않았다.
   *
   * 자동매칭에서만 나온다. 코드로 모을 때는 아는 사람끼리라 안 누르면 말로 해결하지만,
   * 모르는 사람과 붙으면 **상대가 창을 열어두고 가버린 것과 구분할 수 없다.**
   * 시한이 없으면 준비를 누른 쪽이 영원히 그 화면에 남는다.
   */
  | 'readyTimeout'
  | 'unknown'

interface TransportFailure {
  readonly kind: TransportFailureKind
  /** 사람에게 보여줄 문장 */
  readonly message: string
  /** 다시 시도하면 될 수 있는 종류인지 */
  readonly retryable: boolean
}

const FAILURE_TEXT: Record<TransportFailureKind, string> = {
  roomNotFound: '그 코드로 기다리는 방이 없습니다. 코드를 다시 확인해 주세요.',
  roomFull: '방이 이미 꽉 찼습니다.',
  brokerUnreachable: '중계 서버에 닿지 못했습니다. 네트워크를 확인하거나 잠시 뒤 다시 시도해 주세요.',
  peerLost: '상대와의 연결이 끊겼습니다.',
  handshakeStalled:
    '상대와 붙었는데 시작 신호가 오지 않았습니다. 양쪽 다 나갔다가 방을 새로 만들어 주세요.',
  readyTimeout: '상대가 준비하지 않았습니다. 다시 상대를 찾아보세요.',
  unknown: '연결에 실패했습니다.',
}

function failure(kind: TransportFailureKind, retryable = true): TransportFailure {
  return { kind, message: FAILURE_TEXT[kind], retryable }
}

export { failure, FAILURE_TEXT }
export type {
  Transport,
  TransportEvent,
  TransportHandlers,
  TransportFailure,
  TransportFailureKind,
}
