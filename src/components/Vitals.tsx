import { LIVES } from '../game/config.ts'

/**
 * 플레이 중 계속 확인해야 하는 두 값.
 * 시선이 아레나와 입력창(가운데·가운데 아래)에 붙어 있으므로 좌상단 HUD가 아니라
 * 입력창 양옆에 둔다 — 확인하려고 눈을 떼지 않아도 된다.
 */
function Lives({ lives }: { lives: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11, color: '#6a7290', letterSpacing: '0.08em' }}>목숨</span>
      <span style={{ fontSize: 22, letterSpacing: '0.1em', lineHeight: 1 }}>
        {Array.from({ length: LIVES }, (_, index) => (
          <span key={index} style={{ color: index < lives ? '#ff6b6b' : '#2e3448' }}>
            ♥
          </span>
        ))}
      </span>
    </div>
  )
}

function Combo({ combo }: { combo: number }) {
  const active = combo > 0
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span style={{ fontSize: 11, color: '#6a7290', letterSpacing: '0.08em' }}>콤보</span>
      <span
        style={{
          fontSize: 26,
          fontWeight: 700,
          lineHeight: 1,
          color: active ? '#6bffb0' : '#2e3448',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {active ? `x${combo}` : '—'}
      </span>
    </div>
  )
}

export { Lives, Combo }
