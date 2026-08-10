import type { CompetitionSessionPhase } from '../competition/CompetitionSession.ts'
import type { CompetitionJoinRequest } from '../hooks/useCompetitionSession.ts'
import { CompetitionReadyRoom } from './competition/CompetitionReadyRoom.tsx'
import { ManualMatch } from './lobby/ManualMatch.tsx'
import { MatchCountdown } from './lobby/MatchCountdown.tsx'
import { Notice } from './lobby/Notice.tsx'
import { WaitingRoom } from './lobby/WaitingRoom.tsx'

interface CompetitionLobbyScreenProps {
  phase: CompetitionSessionPhase | null
  onOpen: (request: CompetitionJoinRequest) => void
  onReady: () => void
  onBack: () => void
}

function CompetitionLobbyScreen({
  phase,
  onOpen,
  onReady,
  onBack,
}: CompetitionLobbyScreenProps) {
  if (phase === null) {
    return <ManualMatch title="경쟁 모드" onOpen={onOpen} onBack={onBack} />
  }
  if (phase.kind === 'connecting') {
    return <Notice title="연결 중…" detail="중개 서버를 거쳐 경쟁 방에 들어갑니다" onBack={onBack} />
  }
  if (phase.kind === 'handshaking') {
    return <Notice title="방에 들어왔습니다" detail="경쟁 모드 명단을 기다립니다…" onBack={onBack} />
  }
  if (phase.kind === 'waiting') {
    return <WaitingRoom roomCode={phase.roomCode} onBack={onBack} />
  }
  if (phase.kind === 'ready') {
    return <CompetitionReadyRoom phase={phase} onReady={onReady} onBack={onBack} />
  }
  if (phase.kind === 'countdown') {
    return <MatchCountdown phase={{ ...phase, starter: null }} />
  }
  if (phase.kind === 'failed') {
    return <Notice title="경쟁 모드를 끝냈습니다" detail={phase.failure.message} onBack={onBack} danger />
  }
  return null
}

export { CompetitionLobbyScreen }
