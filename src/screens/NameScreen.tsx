import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { soundBoard } from '../audio/SoundBoard.ts'
import { MenuButton } from '../components/MenuButton.tsx'
import { ADJECTIVES, joinName, nouns, randomName } from '../game/data/nicknames.ts'
import { hashOf } from '../game/data/materials.ts'
import { VARIANT_BY_ID } from '../game/data/words.ts'
import { useMenuKeys } from '../hooks/useMenuKeys.ts'
import { Avatar } from '../components/Avatar.tsx'
import { loadCollection } from '../storage/collection.ts'
import { loadProfile, renameProfile, setProfileIcon } from '../storage/profile.ts'
import { syncProfile } from '../rank/client.ts'

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
 * **고르는 동안에는 저장하지 않는다.** 넘겨보다가 마음이 바뀌는 것이 이 화면의 정상
 * 쓰임인데, 넘길 때마다 저장하면 되돌릴 길이 없다. 그래서 나가는 문을 둘로 나눴다 —
 * '사용하기'로 나가면 지금 것이 남고, '돌아가기'로 나가면 쓰던 이름 그대로다.
 */
interface NameScreenProps {
  onBack: () => void
  /** 새 이름을 쓰기로 했을 때만. 부르는 쪽이 화면에 이름을 띄우고 있으면 여기서 받는다 */
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

/**
 * 고를 수 있는 아이콘 — 도감에서 모은 것.
 *
 * 도감과 같은 차례(id 해시)로 늘어놓는다. 무작위처럼 보이면서 언제 열어도 같은 자리라,
 * 어제 본 물건을 다시 찾을 수 있다.
 */
function collected(): string[] {
  return loadCollection().sort((a, b) => hashOf(a) - hashOf(b))
}

function labelOfIcon(icon: string, count: number): string {
  if (icon === '') {
    // 아직 아무것도 못 만난 사람에게는 고를 것이 없다는 사실 자체를 알려야 한다
    return count > 1 ? '기본 사진' : '아직 모은 물건이 없다'
  }
  return VARIANT_BY_ID.get(icon)?.label ?? icon
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
  const [before] = useState(() => loadProfile())
  const [[adjective, noun], setParts] = useState(() => partsOf(before.name, nounList))

  /*
   * 아이콘은 **모은 것 중에서만** 고른다. 도감과 같은 차례로 늘어놓아 열 때마다 자리가
   * 같게 두고, 맨 앞에 '없음'을 둔다 — 골랐다가 그만두는 길이 있어야 한다.
   */
  const icons = useMemo(() => ['', ...collected()], [])
  const [icon, setIcon] = useState(() => {
    const at = icons.indexOf(before.icon)
    return at < 0 ? 0 : at
  })

  // 부르는 쪽이 인라인 함수를 넘기므로 의존성에 넣으면 매 렌더마다 새로 묶인다
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const name = joinName({
    adjective: ADJECTIVES[adjective] ?? '',
    noun: nounList[noun] ?? '',
  })
  const pickedIcon = icons[icon] ?? ''

  /** 지금 고른 것을 쓴다. 저장은 여기 한 곳에서만 일어난다 */
  const use = useCallback(() => {
    renameProfile(name)
    const profile = setProfileIcon(pickedIcon)
    // 화면 전환을 막지는 않는다. 타이틀에서 순위표를 다시 읽을 때도 재동기화한다.
    void syncProfile(profile)
    onChangeRef.current?.(name)
    onBack()
  }, [name, pickedIcon, onBack])

  /** 값 줄 하나를 한 칸 옮긴다. 끝에서 반대편으로 돌아간다 */
  const step = useCallback(
    (row: number, by: number) => {
      if (row === 2) {
        setIcon((at) => (at + by + icons.length) % icons.length)
        return
      }
      setParts(([a, n]) =>
        row === 0
          ? [(a + by + ADJECTIVES.length) % ADJECTIVES.length, n]
          : [a, (n + by + nounList.length) % nounList.length],
      )
    },
    [nounList, icons],
  )

  const shuffle = useCallback(() => {
    const made = randomName()
    setParts([ADJECTIVES.indexOf(made.adjective), nounList.indexOf(made.noun)])
  }, [nounList])

  const rows = [
    { kind: 'pick' as const, label: '꾸미말', value: ADJECTIVES[adjective] ?? '' },
    { kind: 'pick' as const, label: '물건', value: nounList[noun] ?? '' },
    {
      kind: 'pick' as const,
      label: '프로필 사진',
      value: labelOfIcon(pickedIcon, icons.length),
      icon: pickedIcon,
    },
    { kind: 'act' as const, label: '다시 뽑기', run: shuffle, primary: false },
    { kind: 'act' as const, label: '사용하기', run: use, primary: true },
    { kind: 'act' as const, label: '돌아가기 (Esc)', run: onBack, primary: false },
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
    // Escape는 나가는 것이지 정하는 것이 아니다 — 쓰던 이름 그대로 둔다
    onCancel: onBack,
  })

  /*
   * 좌우는 useMenuKeys가 다루지 않는다 — 위아래로 고르는 메뉴가 대부분이라
   * 그쪽에 넣으면 쓰지 않는 화면까지 좌우 키를 먹는다. 여기서만 듣는다.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const by = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
      if (by === 0 || menu.index > 2) {
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
          내 프로필
        </h1>
        <p style={{ fontSize: 12, color: '#6a7290', margin: '10px 0 22px' }}>
          순위표와 대전 상대에게 이렇게 보입니다
        </p>
        <p style={{ fontSize: 12, color: '#7c85a8', margin: '-14px 0 22px' }}>
          도감에 모은 물건을 프로필 사진으로 쓸 수 있습니다
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
                icon={row.icon}
              />
            ) : (
              <MenuButton
                key={row.label}
                selected={menu.index === index}
                onClick={row.run}
                onHover={() => menu.select(index)}
                primary={row.primary}
              >
                {row.label}
              </MenuButton>
            ),
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            margin: '22px 0 0',
          }}
        >
          {/* 테두리는 다른 자리와 같은 색이다. 여기만 강조하면 아이콘이 골라진 줄로 읽힌다 */}
          <Avatar icon={pickedIcon} size={34} />
          <p style={{ font: '700 22px/1.3 var(--sans)', color: '#e4e68a', margin: 0 }} data-my-name>
            {name}
          </p>
        </div>
        <p style={{ marginTop: 16, fontSize: 12, color: '#4a5171' }}>
          ↑↓로 고르고 ←→로 값을 바꿉니다
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
  /** 값이 물건이면 그림도 함께 보여준다 — 이름만으로는 무엇인지 떠오르지 않는다 */
  icon?: string
}

/**
 * 값 하나를 좌우로 넘기는 줄.
 *
 * 화살표를 양옆에 그려두는 이유는 이 줄이 누르는 것이 아니라 **넘기는 것**임을
 * 알려야 하기 때문이다. 버튼과 같은 모양이면 Enter만 눌러보고 좌우가 있는 줄 모른다.
 */
function PickRow({ label, value, selected, onHover, onStep, icon }: PickRowProps) {
  const arrowStyle: CSSProperties = {
    width: 34,
    padding: '6px 0',
    fontSize: 15,
    color: selected ? '#e4e68a' : '#6a7290',
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
        border: `1px solid ${selected ? '#e4e68a' : '#48507a'}`,
        background: selected ? '#21211f' : 'transparent',
      }}
      data-pick-row={label}
      data-selected={selected ? 'yes' : 'no'}
    >
      <button type="button" style={arrowStyle} onClick={() => onStep(-1)} aria-label={`${label} 이전`}>
        ◀
      </button>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        {icon !== undefined && <Avatar icon={icon} size={30} />}
        <div>
          <div style={rowLabelStyle}>{label}</div>
          <div style={{ fontSize: 17, fontWeight: 600, color: selected ? '#e4e68a' : '#b6bdd4' }}>
            {value}
          </div>
        </div>
      </div>
      <button type="button" style={arrowStyle} onClick={() => onStep(1)} aria-label={`${label} 다음`}>
        ▶
      </button>
    </div>
  )
}

export { NameScreen }
