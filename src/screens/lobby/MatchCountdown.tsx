import { Countdown } from '../../components/Countdown.tsx'
import { useStartAlert } from '../../hooks/useStartAlert.ts'
import type { SessionPhase } from '../../multi/MatchSession.ts'

/** 모두 준비한 뒤 시작까지 세는 화면 */
/**
 * 시작까지 세는 화면.
 *
 * 준비를 누르는 순간 바로 시작하면 첫 단어가 이미 내려오고 있다 — 누른 사람은
 * 마우스에 손이 가 있고 키보드로 옮길 틈이 없다. 특히 마지막에 누른 사람이 아니면
 * 언제 열리는지 모른 채 당한다.
 *
 * 숫자를 크게 두는 이유는 **눈이 여기 하나에만 있게** 하려는 것이다. 명단이나 규칙을
 * 같이 두면 그것을 읽다가 시작을 놓친다.
 */
function MatchCountdown({ phase }: { phase: Extract<SessionPhase, { kind: 'countdown' }> }) {
  // 탭을 보고 있지 않으면 소리와 제목으로 부른다 — 첫 차례를 그대로 날리게 된다
  useStartAlert(true)

  return (
    <Countdown
      secondsLeft={phase.secondsLeft}
      note={phase.players.map((player) => player.nickname).join(' · ')}
    />
  )
}

export { MatchCountdown }
