import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { soundBoard } from '../audio/SoundBoard.ts'
import { MenuButton } from '../components/MenuButton.tsx'
import { ADJECTIVES, joinName, nouns, randomName } from '../game/data/nicknames.ts'
import { useMenuKeys } from '../hooks/useMenuKeys.ts'
import { loadProfile, renameProfile } from '../storage/profile.ts'

/**
 * 이름을 고르는 화면.
 *
 * 자유 입력 칸이 아닌 이유는 이 이름이 **순위표와 대전 상대에게 그대로 보이기**
 * 때문이다. 아무 말이나 적을 수 있으면 언젠가 누군가는 욕을 적고, 그것을 막는 일은
 * 금칙어 목록을 계속 손보는 끝없는 일이 된다. 재료를 정해두면 그 일 자체가 없어진다.
 *
 * 고르는 값이 둘뿐이라 좌우 화살표로 넘긴다. 2,000가지를 하나씩 넘겨보라는 뜻은
 * 아니고, 마음에 드는 것이 나올 때까지 '다시 뽑기'를 누르다가 한쪽만 손보는 쓰임을
 * 생각한 것이다.
 *
 * 고른 즉시 저장한다. 확인 버튼을 따로 두면 "바꿨는데 저장이 됐나"가 남는데,
 * 되돌릴 것이 이름 하나뿐이라 그 물음이 값보다 비싸다.
 */
interface NameScreenProps {
  onBack: () => void
  /** 이름이 바뀔 때마다. 부르는 쪽이 화면에 이름을 띄우고 있으면 여기서 받는다 */
  onChange?: (name: string) => void
}

const rootStyle: CSSProperties = {
  height: '100%',
  display: 'grid',
  placeItems: 'center',
  padding: 24,
}

const rowLabelStyle: CSSProperties = {
  fontSize: 12,
  color: '#6a7290',
  letterSpacing: '0.06em',
  textAlign: 'left',
}

/** 저장된 이름이 어느 재료로 만들어졌는지 되찾는다. 화면을 다시 열면 이어서 고른다 */
function partsOf(name: string, nounList: readonly string[]): [number, number] {
  const gap = name.indexOf(' ')
  const adjective = ADJECTIVES.indexOf(name.slice(0, gap))
  const noun = nounList.indexOf(name.slice(gap + 1))
  if (adjective < 0 || noun < 0) {
    const made = randomName()
    return [ADJECTIVES.indexOf(made.adjective), nounList.indexOf(made.noun)]
  }
  return [adjective, noun]
}

function NameScreen({ onBack, onChange }: NameScreenProps) {
  const nounList = useMemo(() => nouns(), [])
  const [[adjective, noun], setParts] = useState(() =>
    partsOf(loadProfile().name, nounList),
  )

  // 부르는 쪽이 인라인 함수를 넘기므로 의존성에 넣으면 매 렌더마다 새로 묶인다
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const name = joinName({
    adjective: ADJECTIVES[adjective] ?? '',
    noun: nounList[noun] ?? '',
  })

  /*
   * 고른 값이 곧 저장된 값이다.
   *
   * 이름이 바뀌는 자리를 여기 하나로 모은다. 이펙트로 "이름이 바뀌면 저장한다"고
   * 쓰면 화면을 처음 열기만 해도 한 번 저장되고, 그 한 번이 저장소에 남은 값을
   * 지금 재료로 다시 쓴 것인지 사람이 고른 것인지 구분되지 않는다.
   */
  const commit = useCallback(
    (next: [number, number]) => {
      setParts(next)
      const picked = joinName({
        adjective: ADJECTIVES[next[0]] ?? '',
        noun: nounList[next[1]] ?? '',
      })
      renameProfile(picked)
      onChangeRef.current?.(picked)
    },
    [nounList],
  )

  /** 값 줄 하나를 한 칸 옮긴다. 끝에서 반대편으로 돌아간다 */
  const step = useCallback(
    (row: number, by: number) => {
      commit(
        row === 0
          ? [(adjective + by + ADJECTIVES.length) % ADJECTIVES.length, noun]
          : [adjective, (noun + by + nounList.length) % nounList.length],
      )
    },
    [adjective, noun, nounList, commit],
  )

  const shuffle = useCallback(() => {
    const made = randomName()
    commit([ADJECTIVES.indexOf(made.adjective), nounList.indexOf(made.noun)])
  }, [nounList, commit])

  const rows = [
    { kind: 'pick' as const, label: '꾸미말', value: ADJECTIVES[adjective] ?? '' },
    { kind: 'pick' as const, label: '물건', value: nounList[noun] ?? '' },
    { kind: 'act' as const, label: '다시 뽑기', run: shuffle },
    { kind: 'act' as const, label: '돌아가기 (Esc)', run: onBack },
  ]

  const menu = useMenuKeys({
    count: rows.length,
    // 값 줄에서 Enter는 옵션 화면과 같게 다음 값으로 넘긴다
    onActivate: (index) => {
      const row = rows[index]
      if (row?.kind === 'act') {
        row.run()
        return
      }
      step(index, 1)
    },
    onCancel: onBack,
  })

  /*
   * 좌우는 useMenuKeys가 다루지 않는다 — 위아래로 고르는 메뉴가 대부분이라
   * 그쪽에 넣으면 쓰지 않는 화면까지 좌우 키를 먹는다. 여기서만 듣는다.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const by = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
      if (by === 0 || menu.index > 1) {
        return
      }
      event.preventDefault()
      step(menu.index, by)
      soundBoard().handle({ kind: 'menuMove' })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [menu, step])

  return (
    <div style={rootStyle}>
      <div style={{ textAlign: 'center', minWidth: 320 }}>
        <h1 style={{ font: '700 32px/1.2 var(--sans)', color: '#f2f4fb', margin: 0 }}>
          내 이름
        </h1>
        <p style={{ fontSize: 12, color: '#6a7290', margin: '10px 0 22px' }}>
          순위표와 대전 상대에게 이렇게 보인다
        </p>

        <div style={{ display: 'grid', gap: 10 }} data-name-picker>
          {rows.map((row, index) =>
            row.kind === 'pick' ? (
              <PickRow
                key={row.label}
                label={row.label}
                value={row.value}
                selected={menu.index === index}
                onHover={() => menu.select(index)}
                onStep={(by) => {
                  step(index, by)
                  menu.select(index)
                }}
              />
            ) : (
              <MenuButton
                key={row.label}
                selected={menu.index === index}
                onClick={row.run}
                onHover={() => menu.select(index)}
              >
                {row.label}
              </MenuButton>
            ),
          )}
        </div>

        <p
          style={{
            font: '700 22px/1.3 var(--sans)',
            color: '#ffcf5c',
            margin: '22px 0 0',
          }}
          data-my-name
        >
          {name}
        </p>
        <p style={{ marginTop: 16, fontSize: 12, color: '#4a5171' }}>
          ↑↓로 고르고 ←→로 값을 바꾼다
        </p>
      </div>
    </div>
  )
}

interface PickRowProps {
  label: string
  value: string
  selected: boolean
  onHover: () => void
  onStep: (by: number) => void
}

/**
 * 값 하나를 좌우로 넘기는 줄.
 *
 * 화살표를 양옆에 그려두는 이유는 이 줄이 누르는 것이 아니라 **넘기는 것**임을
 * 알려야 하기 때문이다. 버튼과 같은 모양이면 Enter만 눌러보고 좌우가 있는 줄 모른다.
 */
function PickRow({ label, value, selected, onHover, onStep }: PickRowProps) {
  const arrowStyle: CSSProperties = {
    width: 34,
    padding: '6px 0',
    fontSize: 15,
    color: selected ? '#ffcf5c' : '#6a7290',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
  }

  return (
    <div
      onMouseEnter={onHover}
      style={{
        display: 'grid',
        gridTemplateColumns: '34px 1fr 34px',
        alignItems: 'center',
        padding: '7px 8px',
        borderRadius: 10,
        border: `1px solid ${selected ? '#ffcf5c' : '#48507a'}`,
        background: selected ? '#2c2413' : 'transparent',
      }}
      data-pick-row={label}
      data-selected={selected ? 'yes' : 'no'}
    >
      <button type="button" style={arrowStyle} onClick={() => onStep(-1)} aria-label={`${label} 이전`}>
        ◀
      </button>
      <div>
        <div style={rowLabelStyle}>{label}</div>
        <div style={{ fontSize: 17, fontWeight: 600, color: selected ? '#ffcf5c' : '#b6bdd4' }}>
          {value}
        </div>
      </div>
      <button type="button" style={arrowStyle} onClick={() => onStep(1)} aria-label={`${label} 다음`}>
        ▶
      </button>
    </div>
  )
}

export { NameScreen }
