import type { SessionPhase } from '../../multi/MatchSession.ts'
import './ModeRoulette.css'

type RoulettePhase = Extract<SessionPhase, { kind: 'roulette' }>

/** 준비방 중앙에서 돌고, 멈춘 뒤 선택된 모드를 공개한다. */
function ModeRoulette({ phase }: { phase: RoulettePhase }) {
  const result = phase.matchMode === 'duel' ? '대결' : '함께 쌓기'

  return (
    <div className="mode-roulette" role="status" aria-live="polite" data-result={phase.matchMode}>
      <div className="mode-roulette__panel">
        <p className="mode-roulette__eyebrow">시작 모드 룰렛</p>
        <div className="mode-roulette__pointer" aria-hidden="true" />
        <div
          className={`mode-roulette__wheel mode-roulette__wheel--${phase.matchMode}`}
          aria-hidden="true"
        />
        <div className="mode-roulette__legend" aria-hidden="true">
          <span><i className="mode-roulette__swatch mode-roulette__swatch--shared" />함께 쌓기</span>
          <span><i className="mode-roulette__swatch mode-roulette__swatch--duel" />대결</span>
        </div>
        <p className="mode-roulette__result">
          <strong>{result}</strong>
          <span>이 모드로 시작합니다</span>
        </p>
      </div>
    </div>
  )
}

export { ModeRoulette }
