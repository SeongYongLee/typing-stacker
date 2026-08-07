import type { CSSProperties } from 'react'
import { RECIPES } from '../game/data/recipes.ts'
import { VARIANT_BY_ID, WORDS } from '../game/data/words.ts'
import type { ItemVariant } from '../game/types/game.ts'

interface CollectionScreenProps {
  collected: readonly string[]
  onBack: () => void
}

/** 도감에 오르는 것은 히든뿐이다. 기본 물건은 치면 언제나 나오므로 모을 것이 없다 */
const HIDDEN_VARIANTS: readonly ItemVariant[] = WORDS.flatMap((entry) =>
  entry.variants.filter((item) => item.hidden),
)

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
  const total = HIDDEN_VARIANTS.length

  return (
    <div style={rootStyle}>
      <div style={{ maxWidth: 760, margin: '0 auto 24px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, margin: 0 }}>도감</h1>
        <p style={{ color: '#b6bdd4', fontSize: 14, margin: '10px 0 0' }}>
          히든 물건은 두 갈래로 만난다 — 단어를 맞췄을 때 낮은 확률로 나오거나,
          재료를 서로 닿게 해 합치거나.
        </p>
        <p style={{ color: '#ffcf5c', fontSize: 15, fontWeight: 600, margin: '12px 0 0' }}>
          {found.size} / {total}
        </p>
      </div>

      <div style={gridStyle} data-collection>
        {HIDDEN_VARIANTS.map((item) => {
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
              {/* 만드는 법은 아직 못 만든 것에도 보여준다 — 도감은 목표를 주는 것이지 감추는 것이 아니다 */}
              <span style={{ fontSize: 11, color: '#7c85a8', textAlign: 'center' }}>
                {inputs === null
                  ? '운으로만 만난다'
                  : inputs.map(labelOf).join(' + ')}
              </span>
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
