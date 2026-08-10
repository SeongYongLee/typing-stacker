import { useState } from 'react'
import { MenuButton } from '../../components/MenuButton.tsx'
import { MenuField } from '../../components/MenuField.tsx'
import { IconPicker } from '../../components/IconPicker.tsx'
import { useMenuKeys } from '../../hooks/useMenuKeys.ts'
import type { JoinRequest } from '../../hooks/useMatchSession.ts'
import { NICKNAME_MAX, ROOM_CODE_LENGTH, isRoomCode } from '../../multi/protocol.ts'
import {
  isUsableName,
  loadManualIcon,
  loadManualName,
  saveManualIcon,
  saveManualName,
} from '../../storage/manualName.ts'
import { fieldStyle, panelStyle, pathLabelStyle, rootStyle } from './lobbyStyle.ts'

/**
 * 친선전 — 이름을 적고 방을 열거나 코드로 들어간다.
 *
 * 이 화면만 이름을 다룬다. 기기 이름과 다른 이름이고 그 까닭은 `storage/manualName.ts`에 있다.
 */
/**
 * 코드를 주고받아 모이는 길.
 *
 * **이름을 적어야 열린다.** 이 이름은 기기 이름과 다르다 — 기기 이름은 순위표에 올라
 * 모두가 보는 값이라 재료 낱말만 받지만, 여기는 아는 사람끼리 모이는 자리라 서로
 * 부르기로 한 이름을 그대로 쓰는 것이 맞다. 그래서 자유 입력이고, 그 방 안에서만 쓰인다.
 *
 * 한 번 적은 이름은 저장해 다음에 채워둔다. 같은 사람들과 다시 할 때마다 새로 짓게
 * 하면 그것이 문턱이 된다.
 */
function ManualMatch({
  onOpen,
  onBack,
}: {
  onOpen: (request: JoinRequest) => void
  onBack: () => void
}) {
  const [name, setName] = useState(() => loadManualName())
  /*
   * 아이콘도 이 방만의 것이다 — 이름을 갈라둔 것과 같은 이유다.
   * 고를 수 있는 것은 여기서도 도감에서 모은 것뿐이라 `IconPicker`가 그것만 돌린다.
  */
  const [icon, setIcon] = useState(() => loadManualIcon())
  const [code, setCode] = useState('')

  const trimmedCode = code.trim().toLowerCase()
  const named = isUsableName(name)
  const codeReady = named && isRoomCode(trimmedCode)

  const enter = (mode: JoinRequest['mode']): void => {
    if (!named) {
      return
    }
    // 다음에 또 적지 않게 남긴다. 방에 들어가는 것이 확정된 순간에만 저장한다
    saveManualName(name)
    saveManualIcon(icon)
    onOpen({ mode, nickname: name, icon })
  }
  const host = () => enter({ kind: 'host' })
  const join = () => {
    if (codeReady) {
      enter({ kind: 'join', code: trimmedCode })
    }
  }

  /*
   * **입력칸도 줄이다.** 화면에 놓인 차례 그대로 늘어놓는다 —
   * 이름을 다 적고 아래를 누르면 아이콘으로, 거기서 또 아래면 방 생성으로 간다.
   * 예전에는 입력칸이 목록 밖에 있어서 이름을 적고 나면 마우스를 잡아야 했다.
   *
   * 아이콘 줄은 눌러서 들어가는 것이 아니라 ←→로 값을 넘기는 것이라 run이 비어 있다.
   */
  const items = [
    { blurb: 'name', run: () => {}, disabled: false },
    { blurb: 'name', run: () => {}, disabled: false },
    { blurb: 'host', run: host, disabled: !named },
    { blurb: 'join', run: join, disabled: false },
    { blurb: 'join', run: join, disabled: !codeReady },
    { blurb: 'back', run: onBack, disabled: false },
  ]

  /*
   * Tab도 ↓와 같게 줄을 옮긴다.
   *
   * 겹치지 않는 이유는 `useMenuKeys`가 **글자를 치는 중에는 끼어들지 않기** 때문이다 —
   * 입력칸 안의 Tab은 `MenuField`가 받고, 그 밖에서는 여기가 받는다. 둘이 같은 일을
   * 하므로 사람 입장에서는 화면 어디에 있든 Tab이 한 줄 아래다.
   */
  const menu = useMenuKeys({
    count: items.length,
    onActivate: (index) => {
      const item = items[index]
      if (item !== undefined && !item.disabled) {
        item.run()
      }
    },
    onCancel: onBack,
  })

  /** 끝에서 반대편으로 돌아간다 — 줄이 여럿이라 끝을 만날 일이 잦다 */
  const moveTo = (next: number) => menu.select((next + items.length) % items.length)

  return (
    <div style={rootStyle}>
      <div
        data-manual-match={named ? 'named' : 'unnamed'}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 20,
          alignItems: 'start',
          width: 'min(900px, 96vw)',
        }}
      >
        <div style={{ ...panelStyle, width: '100%', gap: 12 }}>
          <h2 style={{ font: '700 24px/1.3 var(--sans)', color: '#f2f4fb', margin: 0 }}>
            친선전
          </h2>

          <span style={pathLabelStyle}>이름</span>
          <MenuField
            label="이름"
            style={fieldStyle}
            value={name}
            onChange={setName}
            placeholder="같이 할 사람들에게 보일 이름"
            maxLength={NICKNAME_MAX}
            index={0}
            selected={menu.index === 0}
            onMove={moveTo}
          />

          <span style={pathLabelStyle}>아이콘</span>
          <IconPicker
            icon={icon}
            onChange={setIcon}
            selected={menu.index === 1}
            onHover={() => menu.select(1)}
          />

          {/*
            왜 잠겼는지를 말해준다. 버튼만 회색이면 무엇을 해야 열리는지 알 수 없고,
            이 화면에서 할 일이 이름을 적는 것 하나뿐이라 더 그렇다.

            "아래가 열린다"가 아니라 **무엇이 되는지**를 적는다 — 아래를 이미 보고 있는
            사람에게 아래를 가리키는 말은 아무것도 알려주지 않는다.
          */}
          {!named && (
            <span style={{ ...pathLabelStyle, color: '#e4e68a' }} data-name-hint>
              이름을 적으면 방을 만들거나 참가할 수 있습니다
            </span>
          )}
        </div>

        <div style={{ ...panelStyle, width: '100%', gap: 12 }}>
          <span style={pathLabelStyle}>방 생성</span>
          <MenuButton
            selected={menu.index === 2}
            onClick={host}
            onHover={() => menu.select(2)}
            disabled={!named}
            primary
          >
            방 생성하기
          </MenuButton>

          {/*
            코드 칸은 참가 버튼 바로 위에 둔다. 떼어놓으면 코드를 받은 사람이
            어디에 넣어야 할지 헤맨다 — 한 길의 처음과 끝이어야 한다.
          */}
          <span style={{ ...pathLabelStyle, marginTop: 6 }}>방 참여</span>
          <MenuField
            label="방 코드"
            style={fieldStyle}
            value={code}
            onChange={setCode}
            placeholder="방 참가 코드"
            maxLength={ROOM_CODE_LENGTH}
            autoCapitalize="off"
            index={3}
            selected={menu.index === 3}
            onMove={moveTo}
            onSubmit={join}
          />
          <MenuButton
            selected={menu.index === 4}
            onClick={join}
            onHover={() => menu.select(4)}
            disabled={!codeReady}
          >
            방 참가하기
          </MenuButton>

          <MenuButton
            selected={menu.index === 5}
            onClick={onBack}
            onHover={() => menu.select(5)}
            style={{ marginTop: 6 }}
          >
            돌아가기 (Esc)
          </MenuButton>
        </div>
      </div>
    </div>
  )
}

/**
 * 그 사람의 티어.
 *
 * **아직 못 받았으면 아무것도 두지 않는다.** "브론즈"를 미리 깔아두면 서버에 닿기
 * 전까지 모두가 브론즈로 보이고, 그 짧은 순간이 곧 잘못된 정보다. 자리만 비워두면
 * 값이 들어올 때 조용히 채워진다.
 */

export { ManualMatch }
