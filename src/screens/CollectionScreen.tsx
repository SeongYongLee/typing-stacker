import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { MenuButton } from '../components/MenuButton.tsx'
import { useMenuKeys } from '../hooks/useMenuKeys.ts'
import { RECIPES } from '../game/data/recipes.ts'
import { VARIANT_BY_ID, WORDS } from '../game/data/words.ts'
import type { ItemVariant } from '../game/types/game.ts'

interface CollectionScreenProps {
  collected: readonly string[]
  onBack: () => void
}

/**
 * 도감은 물건 전부를 담는다.
 *
 * 히든만 담으면 대부분이 물음표인 채로 시작해서 도감이 "아직 아무것도 없는 곳"이 된다.
 * 기본 물건이 먼저 채워지면 첫 판만으로도 칸이 메워지고, 그 사이에 비어 있는
 * 히든 칸이 눈에 띈다 — 무엇을 더 찾아야 하는지가 도감 자체에서 보인다.
 */
const ALL_VARIANTS: readonly ItemVariant[] = WORDS.flatMap((entry) => entry.variants)

/** 이 물건을 만들 수 있는 레시피. 없으면 운으로만 만난다 */
function recipeFor(id: string): readonly string[] | null {
  return RECIPES.find((item) => item.result.id === id)?.inputs ?? null
}

function labelOf(id: string): string {
  return VARIANT_BY_ID.get(id)?.label ?? id
}

/**
 * 머리말과 돌아가기는 제자리에 두고 격자만 스크롤한다.
 * 전부 함께 흐르면 물건이 늘어날수록 돌아가는 길이 화면 밖으로 밀려난다 —
 * 웹에서는 페이지 자체가 스크롤되지 않으므로(body가 overflow hidden) 그 버튼을
 * 찾지 못하면 빠져나갈 방법이 없다.
 */
const rootStyle: CSSProperties = {
  height: '100%',
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr) auto',
  padding: '32px 24px 24px',
}

const scrollStyle: CSSProperties = {
  overflowY: 'auto',
  minHeight: 0,
  padding: '4px 4px 8px',
}

/**
 * 칸 그림의 크기. 퍼센트로 두지 않고 픽셀로 못 박는다.
 *
 * `height: 100%`는 부모가 grid일 때 **자동 크기로 잡힌 행**을 기준으로 풀린다.
 * 그 행은 그림의 원래 높이(256px)를 따라 늘어나 있으므로 100%가 곧 256px이 되고,
 * 세로로 긴 스티커(텀블러, 번개)가 상자를 넘어 아래 이름 위로 올라탔다.
 */
const ICON_SIZE = 72

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
  gap: 12,
  maxWidth: 760,
  margin: '0 auto',
}

function CollectionScreen({ collected, onBack }: CollectionScreenProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)

  /*
   * 도감에는 누를 것이 돌아가기 하나뿐이라 항목을 오갈 것이 없다.
   * 대신 화살표로 목록을 넘긴다 — 57칸이라 스크롤이 필요한데 마우스를 잡게 하면
   * 키보드로 여기까지 온 흐름이 끊긴다.
   */
  useMenuKeys({ count: 1, onActivate: onBack, onCancel: onBack })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const step =
        event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
      if (step === 0 || scrollRef.current === null) {
        return
      }
      event.preventDefault()
      scrollRef.current.scrollBy({ top: step * 140, behavior: 'smooth' })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const found = new Set(collected)
  const total = ALL_VARIANTS.length

  return (
    <div style={rootStyle}>
      <div style={{ maxWidth: 760, margin: '0 auto 24px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, margin: 0 }}>도감</h1>
        <p style={{ color: '#ffcf5c', fontSize: 15, fontWeight: 600, margin: '12px 0 0' }}>
          {found.size} / {total}
        </p>
      </div>

      <div ref={scrollRef} style={scrollStyle}>
        <div style={gridStyle} data-collection>
          {ALL_VARIANTS.map((item) => {
          const owned = found.has(item.id)
          const inputs = recipeFor(item.id)
          return (
            <div
              key={item.id}
              data-entry={item.id}
              data-owned={owned ? 'yes' : 'no'}
              style={{
                /*
                 * 히든은 테두리와 이름 색으로 가른다.
                 * 도감이 물건 전부를 담게 되면서 히든이 그 사이에 묻혔는데,
                 * 모으는 재미는 "저건 특별한 것"이 한눈에 보일 때 생긴다.
                 */
                border: `1px solid ${
                  item.hidden
                    ? owned
                      ? '#8a6d1f'
                      : '#3a2f10'
                    : owned
                      ? '#48507a'
                      : '#242a3d'
                }`,
                borderRadius: 12,
                padding: 12,
                background: item.hidden && owned ? '#221d0f' : owned ? '#1b2032' : '#12151f',
                display: 'grid',
                justifyItems: 'center',
                gap: 6,
              }}
            >
              {owned ? (
                <img
                  src={item.sprite}
                  alt={item.label}
                  style={{ width: ICON_SIZE, height: ICON_SIZE, objectFit: 'contain' }}
                />
              ) : (
                <span
                  style={{
                    width: ICON_SIZE,
                    height: ICON_SIZE,
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 30,
                    color: '#3a4160',
                  }}
                >
                  ?
                </span>
              )}
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: item.hidden
                    ? owned
                      ? '#ffcf5c'
                      : '#5c4a1c'
                    : owned
                      ? '#f2f4fb'
                      : '#525a7d',
                }}
              >
                {owned ? item.label : '???'}
              </span>
              {/*
                만드는 법은 찾은 뒤에만 보여준다. 미리 알려주면 도감이 할 일 목록이 되고,
                무엇이 나올지 모른 채 부딪혀보는 재미가 사라진다.
              */}
              {owned && inputs !== null && (
                <span style={{ fontSize: 11, color: '#7c85a8', textAlign: 'center' }}>
                  {inputs.map(labelOf).join(' + ')}
                </span>
              )}
            </div>
          )
          })}
        </div>
      </div>

      <div style={{ display: 'grid', justifyItems: 'center', gap: 8, paddingTop: 20 }}>
        <MenuButton selected onClick={onBack} style={{ width: 'auto' }}>
          돌아가기 (Esc)
        </MenuButton>
        <span style={{ fontSize: 12, color: '#4a5171' }}>↑↓로 넘긴다</span>
      </div>
    </div>
  )
}

export { CollectionScreen }
