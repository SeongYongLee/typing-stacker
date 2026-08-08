import type { CSSProperties } from 'react'
import { MenuButton } from '../components/MenuButton.tsx'
import { useMenuKeys } from '../hooks/useMenuKeys.ts'

interface PauseOverlayProps {
  onResume: () => void
  onRestart: () => void
  onHome: () => void
  onOptions: () => void
}

const rootStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  // 뒤의 아레나가 비쳐 보인다 — 무엇을 쌓다 멈췄는지 보면서 고르게 된다
  background: 'rgba(13, 15, 22, 0.82)',
  zIndex: 10,
}

/**
 * 판을 멈추고 무엇을 할지 고른다.
 *
 * Escape로 열고 Escape로 닫는다 — 여는 키와 닫는 키가 같아야 "잘못 눌렀다"에서
 * 바로 빠져나올 수 있다. 기본 선택은 계속하기다. 대부분은 실수로 눌렀거나
 * 잠깐 멈춘 것이고, 그 경우 Escape든 Enter든 판으로 돌아간다.
 */
function PauseOverlay({ onResume, onRestart, onHome, onOptions }: PauseOverlayProps) {
  /*
   * 옵션을 나가는 길 앞에 둔다. 판을 멈추는 흔한 이유 하나가 "소리가 크다"인데,
   * 그것이 처음으로/다시 하기 뒤에 있으면 조절하려다 판을 버리게 된다.
   *
   * 설정 값을 여기 늘어놓지 않고 옵션 화면으로 보내는 이유는, 항목이 늘수록
   * 판으로 돌아가는 길이 설정들 사이에 묻히기 때문이다.
   */
  const items = [
    { label: '계속하기', run: onResume, primary: true },
    { label: '다시 하기', run: onRestart, primary: false },
    { label: '옵션', run: onOptions, primary: false },
    { label: '처음으로', run: onHome, primary: false },
  ]

  const menu = useMenuKeys({
    count: items.length,
    onActivate: (index) => items[index]?.run(),
    onCancel: onResume,
  })

  return (
    <div style={rootStyle} data-pause>
      <div style={{ textAlign: 'center', minWidth: 240 }}>
        <p
          style={{
            fontSize: 26,
            fontWeight: 700,
            color: '#f2f4fb',
            margin: '0 0 6px',
            letterSpacing: '0.04em',
          }}
        >
          잠시 멈춤
        </p>
        <p style={{ fontSize: 12, color: '#6a7290', margin: '0 0 22px' }}>
          Esc로 돌아간다
        </p>

        <div style={{ display: 'grid', gap: 10 }}>
          {items.map((item, index) => (
            <MenuButton
              key={item.label}
              selected={menu.index === index}
              onClick={item.run}
              onHover={() => menu.select(index)}
              primary={item.primary}
            >
              {item.label}
            </MenuButton>
          ))}
        </div>
      </div>
    </div>
  )
}

export { PauseOverlay }
