import type { CSSProperties } from 'react'
import { MenuButton } from '../components/MenuButton.tsx'
import { useDisplayMenu } from '../hooks/useDisplayMenu.ts'
import { useMenuKeys } from '../hooks/useMenuKeys.ts'
import { useRulesMenu } from '../hooks/useRulesMenu.ts'
import { useSoundMenu } from '../hooks/useSoundMenu.ts'

interface OptionsScreenProps {
  onBack: () => void
}

const rootStyle: CSSProperties = {
  height: '100%',
  display: 'grid',
  placeItems: 'center',
  padding: 24,
}

const sectionTitleStyle: CSSProperties = {
  margin: '8px 0 2px',
  textAlign: 'left',
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: '0.08em',
  color: '#8f97b8',
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
function OptionsScreen({ onBack }: OptionsScreenProps) {
  const sound = useSoundMenu()
  const display = useDisplayMenu()
  const rules = useRulesMenu()

  // 이름은 여기 없다. 설정이 아니라 "내가 누구로 보이는가"라서 시작 화면 맨 위에 있다
  const sections = [
    { title: '사운드', items: sound },
    { title: '그래픽', items: display },
    { title: '게임 규칙 보기', items: rules },
  ]
  const items = [...sound, ...display, ...rules, { label: '돌아가기 (Esc)', run: onBack }]

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
          Enter로 값을 바꿉니다
        </p>

        <div style={{ display: 'grid', gap: 10 }} data-options>
          {sections.map((section) => (
            <section key={section.title} style={{ display: 'grid', gap: 8 }}>
              <h2 style={sectionTitleStyle}>{section.title}</h2>
              {section.items.map((item) => {
                const index = items.indexOf(item)
                return (
                  <MenuButton
                    key={item.label}
                    selected={menu.index === index}
                    onClick={item.run}
                    onHover={() => menu.select(index)}
                  >
                    {item.label}
                  </MenuButton>
                )
              })}
            </section>
          ))}
          <MenuButton
            selected={menu.index === items.length - 1}
            onClick={onBack}
            onHover={() => menu.select(items.length - 1)}
          >
            돌아가기 (Esc)
          </MenuButton>
        </div>
      </div>
    </div>
  )
}

export { OptionsScreen }
