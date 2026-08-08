import type { CSSProperties } from 'react'
import { MenuButton } from '../components/MenuButton.tsx'
import { useDisplayMenu } from '../hooks/useDisplayMenu.ts'
import { useMenuKeys } from '../hooks/useMenuKeys.ts'
import { useSoundMenu } from '../hooks/useSoundMenu.ts'
import { loadProfile } from '../storage/profile.ts'

interface OptionsScreenProps {
  onBack: () => void
  /**
   * 이름 고르는 화면으로. 없으면 그 줄을 두지 않는다 —
   * 판이 도는 중에 여는 옵션이 그렇다. 지금 판의 기록이 어느 이름으로 올라갈지가
   * 도중에 바뀌면, 끝나고 순위표에서 자기 기록을 못 찾는다.
   */
  onName?: () => void
}

const rootStyle: CSSProperties = {
  height: '100%',
  display: 'grid',
  placeItems: 'center',
  padding: 24,
}

/**
 * 소리와 화면 설정을 한자리에 모은다.
 *
 * 항목이 늘어나기 전까지는 일시정지 메뉴 안에 섞여 있었다. 두 개일 때는 그것으로
 * 충분했지만, 설정이 늘면 판으로 돌아가는 길과 설정을 고르는 길이 같은 목록에서
 * 뒤섞여 "계속하기"를 찾기 어려워진다.
 *
 * 값은 누를 때마다 단계가 돌아간다. 슬라이더가 아닌 이유는 이 게임의 메뉴가
 * 전부 키보드로 움직이기 때문이다.
 */
function OptionsScreen({ onBack, onName }: OptionsScreenProps) {
  // 화면을 열 때 한 번 읽는다. 이름을 바꾸고 돌아오면 이 화면이 새로 만들어진다
  const profileName = loadProfile().name
  const sound = useSoundMenu()
  const display = useDisplayMenu()

  /*
   * 이름을 맨 위에 둔다. 소리·화면과 달리 이것은 **남에게 보이는 값**이라,
   * 순위표에서 자기 이름을 보고 바꾸러 오는 길이 가장 짧아야 한다.
   */
  const items = [
    ...(onName === undefined ? [] : [{ label: `이름 — ${profileName}`, run: onName }]),
    ...sound,
    ...display,
    { label: '돌아가기 (Esc)', run: onBack },
  ]

  const menu = useMenuKeys({
    count: items.length,
    onActivate: (index) => items[index]?.run(),
    onCancel: onBack,
  })

  return (
    <div style={rootStyle}>
      <div style={{ textAlign: 'center', minWidth: 280 }}>
        <h1 style={{ font: '700 32px/1.2 var(--sans)', color: '#f2f4fb', margin: 0 }}>
          옵션
        </h1>
        <p style={{ fontSize: 12, color: '#6a7290', margin: '10px 0 24px' }}>
          Enter로 값을 바꾼다
        </p>

        <div style={{ display: 'grid', gap: 10 }} data-options>
          {items.map((item, index) => (
            <MenuButton
              key={item.label}
              selected={menu.index === index}
              onClick={item.run}
              onHover={() => menu.select(index)}
            >
              {item.label}
            </MenuButton>
          ))}
        </div>
      </div>
    </div>
  )
}

export { OptionsScreen }
