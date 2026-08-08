/**
 * 중계 서버 주소.
 *
 * 직접 붙이는 길(WebRTC)은 NAT을 통과해야만 동작하는데 그 조건이 망마다 달라서, 같은
 * Wi-Fi의 두 기기도 LTE와 Wi-Fi도 붙지 못했다(멀티캐스트 차단·헤어핀 NAT·이동통신
 * CGNAT). 중계는 그 조건을 없앤다 — 바깥으로 나가는 WebSocket 하나면 되고 그건
 * 어디서나 열린다. 그래서 그 길은 남겨두지 않고 지웠다.
 *
 * **주소를 여기 적어두는 이유**는 이것이 비밀이 아니기 때문이다. 어차피 클라이언트
 * 번들에 그대로 실려 나가므로 숨겨봐야 얻는 게 없고, 대신 빌드 설정에 숨겨두면
 * 새로 받은 사람이 "왜 대전이 안 되지"를 코드에서 찾을 수 없다.
 * 로컬 중계로 시험할 때만 VITE_RELAY_URL로 덮어쓴다.
 *
 * 같은 서버가 랭킹도 맡는다(`/rank/*`). 파일을 따로 둔 이유는 대전과 랭킹이 서로를
 * 몰라도 되기 때문이다 — 주소 하나 때문에 랭킹이 대전 코드를 끌고 오면 안 된다.
 */
const DEFAULT_RELAY_URL = 'wss://typing-stacker-relay.typing-stacker-relay.workers.dev'

const RELAY_URL = import.meta.env.VITE_RELAY_URL ?? DEFAULT_RELAY_URL

export { RELAY_URL, DEFAULT_RELAY_URL }
