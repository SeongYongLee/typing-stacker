import type { Message, PlayerId } from './protocol.ts'

/**
 * 대전 연결을 어떻게 맺는지를 숨기는 층.
 *
 * 지금은 PeerJS(WebRTC)를 쓰지만 공용 브로커에 SLA가 없다. 나중에 브로커를 직접
 * 띄우거나 다른 방식으로 갈아탈 때 게임 코드가 흔들리지 않게 인터페이스로 막아둔다.
 *
 * 토폴로지는 스타다 — 방장이 허브가 되어 모든 참가자와 개별 연결을 맺는다.
 * 그래서 방장을 거치면 메시지 순서가 하나로 정해지고, 인원이 늘어도 구조가 같다.
 */
interface Transport {
  /** 나에게 배정된 식별자 */
  readonly selfId: PlayerId
  /** 참가자가 들어올 때 쓸 방 코드. 방장만 값을 가진다 */
  readonly roomCode: string | null
  readonly isHost: boolean
  /** 지금 붙어 있는 상대들 */
  peers(): readonly PlayerId[]
  /** 특정 상대에게. 방장이 개별 응답할 때 쓴다 */
  sendTo(peer: PlayerId, message: Message): void
  /** 붙어 있는 모두에게 */
  broadcast(message: Message): void
  close(): void
}

type TransportEvent =
  | { readonly kind: 'peerJoined'; readonly peer: PlayerId }
  | { readonly kind: 'peerLeft'; readonly peer: PlayerId }
  | { readonly kind: 'message'; readonly from: PlayerId; readonly message: Message }
  | { readonly kind: 'error'; readonly failure: TransportFailure }

interface TransportHandlers {
  onEvent(event: TransportEvent): void
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
  /** 방 코드가 이미 누군가 쓰고 있다 (방장 쪽) */
  | 'codeTaken'
  /** 브로커에 닿지 못했다 */
  | 'brokerUnreachable'
  /** 브라우저가 WebRTC를 지원하지 않는다 */
  | 'unsupported'
  /** 상대와의 연결이 끊겼다 */
  | 'peerLost'
  | 'unknown'

interface TransportFailure {
  readonly kind: TransportFailureKind
  /** 사람에게 보여줄 문장 */
  readonly message: string
  /** 다시 시도하면 될 수 있는 종류인지 */
  readonly retryable: boolean
}

const FAILURE_TEXT: Record<TransportFailureKind, string> = {
  roomNotFound: '그 코드로 기다리는 방이 없다. 코드를 다시 확인해보자.',
  roomFull: '방이 이미 꽉 찼다.',
  codeTaken: '방 코드가 겹쳤다. 다시 만들면 된다.',
  brokerUnreachable:
    '연결 중개 서버에 닿지 못했다. 네트워크를 확인하거나 잠시 뒤 다시 시도해보자.',
  unsupported: '이 브라우저는 WebRTC를 지원하지 않는다. 최신 크롬이나 사파리에서 열어보자.',
  peerLost: '상대와의 연결이 끊겼다.',
  unknown: '연결에 실패했다.',
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
