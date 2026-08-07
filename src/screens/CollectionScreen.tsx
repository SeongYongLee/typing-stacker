import type { CSSProperties } from 'react'
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

const rootStyle: CSSProperties = {
  height: '100%',
  overflowY: 'auto',
  padding: '40px 24px',
}

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
  gap: 12,
  maxWidth: 760,
  margin: '0 auto',
}

function CollectionScreen({ collected, onBack }: CollectionScreenProps) {
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
                border: `1px solid ${owned ? '#48507a' : '#242a3d'}`,
                borderRadius: 12,
                padding: 12,
                background: owned ? '#1b2032' : '#12151f',
                display: 'grid',
                justifyItems: 'center',
                gap: 8,
              }}
            >
              <div
                style={{
                  width: 72,
                  height: 72,
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                {owned ? (
                  <img
                    src={item.sprite}
                    alt={item.label}
                    style={{ maxWidth: '100%', maxHeight: '100%' }}
                  />
                ) : (
                  <span style={{ fontSize: 30, color: '#3a4160' }}>?</span>
                )}
              </div>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: owned ? '#f2f4fb' : '#525a7d',
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

      <div style={{ textAlign: 'center', marginTop: 28 }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            padding: '12px 32px',
            fontSize: 15,
            fontWeight: 600,
            borderRadius: 10,
            border: '1px solid #48507a',
            background: 'transparent',
            color: '#b6bdd4',
            cursor: 'pointer',
          }}
        >
          돌아가기
        </button>
      </div>
    </div>
  )
}

export { CollectionScreen }
