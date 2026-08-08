import { useState } from 'react'
import { Countdown } from '../components/Countdown.tsx'
import { MenuButton } from '../components/MenuButton.tsx'
import { MenuLayout } from '../components/MenuLayout.tsx'
import { Avatar } from '../components/Avatar.tsx'
import { IconPicker } from '../components/IconPicker.tsx'
import { NameGreeting } from '../components/NameGreeting.tsx'
import { Blurb, Key, SidePanel } from '../components/SidePanel.tsx'
import { VersusTier } from '../components/RankBoxes.tsx'
import { useAutoMatch } from '../hooks/useAutoMatch.ts'
import { useLeaderboard } from '../hooks/useLeaderboard.ts'
import { useQueueSize } from '../hooks/useQueueSize.ts'
import {
  isUsableName,
  loadManualIcon,
  loadManualName,
  saveManualIcon,
  saveManualName,
} from '../storage/manualName.ts'
import { NameScreen } from './NameScreen.tsx'
import { loadProfile } from '../storage/profile.ts'
import { useStartAlert } from '../hooks/useStartAlert.ts'
import { useMenuKeys } from '../hooks/useMenuKeys.ts'
import type { CSSProperties, ReactNode } from 'react'
import { MAX_PLAYERS, NICKNAME_MAX, ROOM_CODE_LENGTH, isRoomCode } from '../multi/protocol.ts'
import { ownerColorAt } from '../multi/ownerColors.ts'
import type { SessionPhase } from '../multi/MatchSession.ts'
import type { QueueStatus } from '../rank/queue.ts'
import type { JoinRequest } from '../hooks/useMatchSession.ts'

interface LobbyScreenProps {
  phase: SessionPhase | null
  onOpen: (request: JoinRequest) => void
  onReady: () => void
  onBack: () => void
}

const rootStyle: CSSProperties = {
  height: '100%',
  display: 'grid',
  placeItems: 'center',
  padding: 24,
}

const panelStyle: CSSProperties = {
  width: 'min(440px, 90vw)',
  display: 'grid',
  gap: 18,
  textAlign: 'center',
}

const fieldStyle: CSSProperties = {
  width: '100%',
  font: '600 20px/1.3 var(--sans)',
  color: '#f2f4fb',
  background: '#0d0f16',
  border: '1px solid #2e3448',
  borderRadius: 10,
  padding: '12px 14px',
  textAlign: 'center',
}

const buttonStyle: CSSProperties = {
  padding: '13px 20px',
  fontSize: 16,
  fontWeight: 600,
  borderRadius: 10,
  border: '1px solid #48507a',
  background: '#ffcf5c',
  color: '#1a1405',
}

const pathLabelStyle: CSSProperties = {
  fontSize: 12,
  color: '#6a7290',
  letterSpacing: '0.06em',
}

/**
 * 항목마다의 설명. 시작 화면과 같은 자리에 같은 모양으로 뜬다.
 *
 * 규칙 자체는 시작 화면에서 '함께 하기'를 고를 때 이미 읽었다. 여기서는 **지금 고른
 * 길이 무엇인지**만 말한다 — 코드를 받은 사람과 코드를 만들 사람이 서로 다른 것을
 * 눌러야 하는데, 그 갈림이 버튼 이름만으로는 잘 안 읽혔다.
 */
const LOBBY_BLURBS: Record<string, readonly ReactNode[]> = {
  name: ['같은 방에 들어온 사람에게 이 이름으로 보입니다.'],
  auto: [
    <>
      <Key>비슷한 티어</Key>의 상대와 붙습니다.
    </>,
  ],
  manual: [
    <>
      <Key>방 참가 코드</Key>를 주고받아 아는 사람과 모입니다.
    </>,
    <>
      최대 {MAX_PLAYERS}명까지 들어올 수 있습니다.
    </>,
  ],
  host: [
    <>
      방을 열고 <Key>참가 코드 {ROOM_CODE_LENGTH}자</Key>를 받습니다.
    </>,
    '그 코드를 알려주면 같은 방으로 들어옵니다.',
  ],
  join: [
    <>
      받은 코드를 <Key>위 칸</Key>에 넣습니다.
    </>,
  ],
  back: ['시작 화면으로 나갑니다.'],
}

const ghostButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: 'transparent',
  color: '#b6bdd4',
}

/** 자동 매칭 버튼 아래의 대기 인원. 버튼에 딸린 값이라 붙여둔다 */
const queueNoteStyle: CSSProperties = {
  fontSize: 12,
  color: '#6a7290',
  textAlign: 'center',
  marginTop: -4,
}

function LobbyScreen({ phase, onOpen, onReady, onBack }: LobbyScreenProps) {
  /*
   * 이름은 이 화면의 것이 아니라 **기기의 것**이다.
   *
   * 예전에는 여기 자유 입력 칸이 있었고 그 값은 어디에도 저장되지 않았다. 그래서
   * 들어올 때마다 새로 지어야 했고, 무엇보다 그 이름이 그대로 상대 화면에 뜨는데도
   * 아무 검사가 없었다. 지금은 골라둔 이름을 그대로 쓴다.
   */
  const [nickname, setNickname] = useState(() => loadProfile().name)
  const [naming, setNaming] = useState(false)
  /** 코드를 주고받는 길로 들어갔는가. 그 안에서만 이름 칸과 방 코드 칸이 열린다 */
  const [manual, setManual] = useState(false)
  const board = useLeaderboard()

  /*
   * 자동매칭. 짝이 맺어지면 서버가 정해준 코드로 방을 연다.
   *
   * 코드를 화면에 띄우지 않는 이유는 남에게 알려줄 코드가 아니기 때문이다 —
   * 둘에게만 알려준 것이고, 보여주면 "이걸 전달하라"는 뜻으로 읽힌다.
   *
   * 여기서는 **기기 이름**을 쓴다. 순위표에 오르는 것과 같은 이름이어야 티어가
   * 자기 것으로 보인다.
   */
  const auto = useAutoMatch((matchedCode) => {
    onOpen({ mode: { kind: 'auto', code: matchedCode }, nickname, icon: loadProfile().icon })
  })

  /*
   * 줄에 몇 명이 서 있는지를 **누르기 전에** 보여준다. 아무도 없으면 눌러도 한참
   * 기다릴 뿐인데, 그것을 모르면 자동매칭이 고장난 것으로 읽힌다.
   * 줄에 서 있는 동안에는 대기 화면이 같은 값을 더 자주 보여주므로 여기서는 멈춘다.
   */
  const queueSize = useQueueSize(!manual && !naming && !auto.searching && phase === null)

  const items = [
    { blurb: 'name', run: () => setNaming(true), disabled: false },
    { blurb: 'auto', run: auto.start, disabled: false },
    { blurb: 'manual', run: () => setManual(true), disabled: false },
    { blurb: 'back', run: onBack, disabled: false },
  ]

  /*
   * Tab은 가로채지 않는다. 이 화면에는 이름 칸이 있어서, Tab을 메뉴가 먹으면
   * 입력칸으로 갈 길이 막힌다.
   */
  const menu = useMenuKeys({
    count: items.length,
    useTab: false,
    // 여기 온 사람이 하려는 것은 상대를 만나는 것이다. 이름은 이미 골라둔 값이라 건드릴 일이 드물다
    initialIndex: 1,
    // 이름 화면이나 수동 매칭이 열려 있는 동안에는 그쪽이 키를 갖는다
    active: !naming && !manual,
    onActivate: (index) => {
      const item = items[index]
      if (item !== undefined && !item.disabled) {
        item.run()
      }
    },
    onCancel: onBack,
  })

  if (naming) {
    return <NameScreen onBack={() => setNaming(false)} onChange={setNickname} />
  }

  /*
   * 코드를 주고받는 길. 아직 아무 방에도 붙지 않았을 때만 이 화면이다 —
   * 붙은 뒤에는 아래의 `phase` 분기가 이어받는다.
   */
  if (manual && phase === null) {
    return <ManualMatch onOpen={onOpen} onBack={() => setManual(false)} />
  }

  /*
   * 줄에 서 있는 동안은 이 화면이 앞선다.
   *
   * `phase`보다 먼저 보는 이유는 **상대가 준비하지 않아 되돌아온 경우** 때문이다 —
   * 그때 세션은 'failed'로 남아 있는데, 다시 찾기를 누른 뒤에도 실패 안내가 계속
   * 보이면 아무 일도 일어나지 않는 것처럼 보인다.
   */
  if (auto.searching) {
    return <Searching status={auto.status} onCancel={auto.cancel} />
  }

  /*
   * 상대가 준비하지 않아 끊긴 경우. 자동매칭에서만 나오는 실패라 여기서 갈라 잡는다 —
   * 이 사람은 아무것도 잘못하지 않았으므로 "연결하지 못했다"가 아니라 다시 찾을 길을 준다.
   */
  if (phase?.kind === 'failed' && phase.failure.kind === 'readyTimeout') {
    return (
      <Notice
        title="상대가 준비하지 않았습니다"
        detail="다시 찾아보세요."
        onBack={onBack}
        retry={{ label: '다시 찾기', run: auto.start }}
      />
    )
  }

  if (phase?.kind === 'pairing') {
    return <Notice title="상대를 만났습니다" detail="들어오기를 기다립니다…" onBack={onBack} />
  }

  if (phase?.kind === 'connecting') {
    return <Notice title="연결 중…" detail="중개 서버를 거쳐 상대를 찾습니다" onBack={onBack} />
  }

  /*
   * 붙은 뒤와 붙기 전을 다르게 보여준다.
   * 멈췄을 때 어느 쪽에서 멈춘 것인지가 이 문장 하나로 갈린다 — "연결 중"에서 멈추면
   * 경로가 안 열린 것이고, 여기서 멈추면 상대가 응답하지 않는 것이다.
   */
  if (phase?.kind === 'handshaking') {
    return <Notice title="방에 들어왔습니다" detail="명단을 기다립니다…" onBack={onBack} />
  }

  if (phase?.kind === 'waiting') {
    return <WaitingRoom roomCode={phase.roomCode} onBack={onBack} />
  }

  if (phase?.kind === 'countdown') {
    return <MatchCountdown phase={phase} />
  }

  if (phase?.kind === 'ready') {
    return <ReadyRoom phase={phase} onReady={onReady} onBack={onBack} />
  }

  if (phase?.kind === 'failed') {
    return (
      <Notice
        title="연결하지 못했습니다"
        detail={phase.failure.message}
        onBack={onBack}
        danger
      />
    )
  }

  const blurbKey = items[menu.index]?.blurb ?? 'host'

  /*
   * 시작 화면과 같은 뼈대를 쓴다 — 제목 / 왼쪽 인사와 버튼 / 오른쪽 티어와 설명.
   *
   * 예전에는 이 화면만 세로로 긴 한 덩어리였다. 같은 게임 안에서 화면마다 짜임이
   * 다르면 어디를 봐야 하는지를 화면마다 다시 배워야 하고, 무엇보다 들어왔다 나갈 때
   * 제목과 인사가 다른 자리로 뛴다.
   */
  return (
    <MenuLayout
      title="함께 하기"
      hint="↑↓로 고르고 Enter로 들어갑니다"
      menu={
        <>
          <NameGreeting
            name={nickname}
            icon={loadProfile().icon}
            selected={menu.index === 0}
            onSelect={() => menu.select(0)}
            onActivate={() => setNaming(true)}
          />

          {/*
            자동 매칭이 맨 위다. 아는 사람이 없어도 되는 유일한 길이라 대부분은
            이것을 누르게 된다 — 코드를 만드는 쪽이 먼저 보이면 상대를 구해와야
            하는 게임으로 읽힌다.
          */}
          <MenuButton
            selected={menu.index === 1}
            onClick={auto.start}
            onHover={() => menu.select(1)}
            primary
          >
            자동 매칭
          </MenuButton>
          {/*
            지금 몇 명이 기다리는지. 버튼 아래에 작게 둔다 — 누를지 말지를 정하는 데
            쓰는 값이라 버튼에서 멀면 이어서 읽히지 않는다. 아직 못 물어봤으면
            아무것도 두지 않는다("0명"과 "모른다"는 다른 말이다).
          */}
          {queueSize !== null && (
            <span style={queueNoteStyle} data-queue-size={queueSize}>
              {queueSize === 0
                ? '지금 대기 중인 사람이 없습니다'
                : `지금 ${queueSize}명 대기 중`}
            </span>
          )}

          <MenuButton
            selected={menu.index === 2}
            onClick={() => setManual(true)}
            onHover={() => menu.select(2)}
            style={{ marginTop: 6 }}
          >
            수동 매칭
          </MenuButton>

          <MenuButton
            selected={menu.index === 3}
            onClick={onBack}
            onHover={() => menu.select(3)}
            style={{ marginTop: 6 }}
          >
            돌아가기 (Esc)
          </MenuButton>
        </>
      }
      panel={
        <SidePanel
          kind={blurbKey}
          record={<VersusTier board={board} />}
          blurb={<Blurb kind={blurbKey} lines={LOBBY_BLURBS[blurbKey] ?? []} />}
        />
      }
    />
  )
}

/**
 * 붙은 뒤 시작 전.
 *
 * 상대가 들어오자마자 판이 열리면 누구와 붙는지 볼 겨를도, 손을 키보드에 올릴 겨를도
 * 없다 — 첫 단어가 이미 내려오고 있다. 양쪽이 준비를 눌러야 시작한다.
 */
function ReadyRoom({
  phase,
  onReady,
  onBack,
}: {
  phase: Extract<SessionPhase, { kind: 'ready' }>
  onReady: () => void
  onBack: () => void
}) {
  const ready = new Set(phase.ready)
  const iAmReady = ready.has(phase.selfId)
  const waitingFor = phase.players.filter((player) => !ready.has(player.id)).length

  useMenuKeys({
    count: 1,
    useTab: false,
    onActivate: () => {
      if (!iAmReady) {
        onReady()
      }
    },
    onCancel: onBack,
  })

  return (
    <div style={rootStyle}>
      <div style={panelStyle} data-ready-room={ready.size}>
        <p style={{ color: '#6a7290', margin: 0, fontSize: 13, letterSpacing: '0.08em' }}>
          같이 할 사람들
        </p>

        <div style={{ display: 'grid', gap: 10 }}>
          {phase.players.map((player, index) => {
            const isReady = ready.has(player.id)
            const mine = player.id === phase.selfId
            return (
              <div
                key={player.id}
                data-ready={isReady ? 'yes' : 'no'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '14px 16px',
                  borderRadius: 12,
                  background: '#0d0f16',
                  border: `1px solid ${isReady ? '#3f7a55' : '#2e3448'}`,
                }}
              >
                {/*
                   색 점 자리에 아이콘을 둔다. 테두리가 그 사람의 색이므로 점이 하던
                   일(누가 누구인지)은 그대로이고, 아이콘을 안 고른 사람은 빈 동그라미가
                   같은 자리를 지킨다 — 줄이 어긋나지 않는다.
                 */}
                <Avatar icon={player.icon} size={26} ring={ownerColorAt(index)} />
                <span
                  style={{
                    flex: 1,
                    textAlign: 'left',
                    fontSize: 17,
                    fontWeight: mine ? 700 : 500,
                    color: '#f2f4fb',
                  }}
                >
                  {player.nickname}
                  {mine && ' (나)'}
                </span>
                <span style={{ fontSize: 14, color: isReady ? '#6bffb0' : '#6a7290' }}>
                  {isReady ? '준비됨' : '기다리는 중…'}
                </span>
              </div>
            )
          })}
        </div>

        {/* 규칙 설명은 바로 앞 화면에서 이미 읽었다. 여기서 볼 것은 상대와 준비 상태뿐이다 */}
        <MenuButton selected={!iAmReady} onClick={onReady} disabled={iAmReady} primary>
          {iAmReady ? `상대를 기다립니다… (${waitingFor}명)` : '준비 (Enter)'}
        </MenuButton>

        <MenuButton selected={false} onClick={onBack}>
          나가기 (Esc)
        </MenuButton>
      </div>
    </div>
  )
}

/**
 * 시작까지 세는 화면.
 *
 * 준비를 누르는 순간 바로 시작하면 첫 단어가 이미 내려오고 있다 — 누른 사람은
 * 마우스에 손이 가 있고 키보드로 옮길 틈이 없다. 특히 마지막에 누른 사람이 아니면
 * 언제 열리는지 모른 채 당한다.
 *
 * 숫자를 크게 두는 이유는 **눈이 여기 하나에만 있게** 하려는 것이다. 명단이나 규칙을
 * 같이 두면 그것을 읽다가 시작을 놓친다.
 */
function MatchCountdown({ phase }: { phase: Extract<SessionPhase, { kind: 'countdown' }> }) {
  // 탭을 보고 있지 않으면 소리와 제목으로 부른다 — 첫 차례를 그대로 날리게 된다
  useStartAlert(true)

  return (
    <Countdown
      secondsLeft={phase.secondsLeft}
      note={phase.players.map((player) => player.nickname).join(' · ')}
    />
  )
}

function WaitingRoom({ roomCode, onBack }: { roomCode: string; onBack: () => void }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    void navigator.clipboard?.writeText(roomCode).then(
      () => setCopied(true),
      () => setCopied(false),
    )
  }

  return (
    <div style={rootStyle}>
      <div style={panelStyle}>
        <p style={{ color: '#6a7290', margin: 0, fontSize: 13, letterSpacing: '0.08em' }}>
          이 코드를 같이 할 사람들에게 알려주세요
        </p>
        <div
          data-room-code={roomCode}
          style={{
            font: '700 40px/1.2 var(--mono)',
            letterSpacing: '0.14em',
            color: '#ffcf5c',
            background: '#0d0f16',
            border: '1px solid #2e3448',
            borderRadius: 12,
            padding: '18px 12px',
            userSelect: 'all',
          }}
        >
          {roomCode}
        </div>
        <button type="button" style={buttonStyle} onClick={copy}>
          {copied ? '복사했습니다' : '코드 복사'}
        </button>
        <p style={{ color: '#b6bdd4', margin: 0, fontSize: 14 }}>
          한 명이라도 들어오면 준비 화면으로 넘어갑니다. 더 기다렸다 시작해도 됩니다
        </p>
        <button type="button" style={ghostButtonStyle} onClick={onBack}>
          취소
        </button>
      </div>
    </div>
  )
}

function Notice({
  title,
  detail,
  onBack,
  danger = false,
  retry,
}: {
  title: string
  detail: string
  onBack: () => void
  danger?: boolean
  /** 여기서 곧바로 다시 해볼 수 있는 경우. 나가는 것 말고 다른 길이 있을 때만 준다 */
  retry?: { label: string; run: () => void }
}) {
  return (
    <div style={rootStyle}>
      <div style={panelStyle}>
        <h2
          style={{
            font: '700 26px/1.3 var(--sans)',
            color: danger ? '#ff6b6b' : '#f2f4fb',
            margin: 0,
          }}
        >
          {title}
        </h2>
        <p style={{ color: '#b6bdd4', margin: 0, fontSize: 15, lineHeight: 1.7 }}>{detail}</p>
        {retry !== undefined && (
          <button type="button" style={buttonStyle} onClick={retry.run}>
            {retry.label}
          </button>
        )}
        <button type="button" style={ghostButtonStyle} onClick={onBack}>
          돌아가기
        </button>
      </div>
    </div>
  )
}

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
   * 아이콘 줄도 고를 수 있는 것에 넣는다. 화면에 놓인 차례 그대로다 —
   * ↑↓로 훑는 순서가 눈으로 훑는 순서와 어긋나면 무엇이 골라졌는지 매번 다시 찾는다.
   * 이 줄은 눌러서 들어가는 것이 아니라 ←→로 값을 넘기는 것이라 run이 비어 있다.
   */
  const items = [
    { blurb: 'name', run: () => {}, disabled: false },
    { blurb: 'host', run: host, disabled: !named },
    { blurb: 'join', run: join, disabled: !codeReady },
    { blurb: 'back', run: onBack, disabled: false },
  ]
  const menu = useMenuKeys({
    count: items.length,
    useTab: false,
    // 손은 방을 만드는 자리에서 시작한다. 아이콘은 위에 있되 하러 온 일은 대전이다
    initialIndex: 1,
    onActivate: (index) => {
      const item = items[index]
      if (item !== undefined && !item.disabled) {
        item.run()
      }
    },
    onCancel: onBack,
  })

  return (
    <div style={rootStyle}>
      <div style={{ ...panelStyle, gap: 12 }} data-manual-match={named ? 'named' : 'unnamed'}>
        <h2 style={{ font: '700 24px/1.3 var(--sans)', color: '#f2f4fb', margin: 0 }}>
          수동 매칭
        </h2>

        <span style={pathLabelStyle}>이름</span>
        <input
          style={fieldStyle}
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          placeholder="같이 할 사람들에게 보일 이름"
          maxLength={NICKNAME_MAX}
          spellCheck={false}
          aria-label="이름"
          autoFocus
        />

        <span style={pathLabelStyle}>아이콘</span>
        <IconPicker
          icon={icon}
          onChange={setIcon}
          selected={menu.index === 0}
          onHover={() => menu.select(0)}
        />
        {/*
          왜 잠겼는지를 말해준다. 버튼만 회색이면 무엇을 해야 열리는지 알 수 없고,
          이 화면에서 할 일이 이름을 적는 것 하나뿐이라 더 그렇다.

          "아래가 열린다"가 아니라 **무엇이 되는지**를 적는다 — 아래를 이미 보고 있는
          사람에게 아래를 가리키는 말은 아무것도 알려주지 않는다.
        */}
        {!named && (
          <span style={{ ...pathLabelStyle, color: '#ffcf5c' }} data-name-hint>
            이름을 적으면 방을 만들거나 참가할 수 있습니다
          </span>
        )}

        <span style={{ ...pathLabelStyle, marginTop: 6 }}>방 생성</span>
        <MenuButton
          selected={menu.index === 1}
          onClick={host}
          onHover={() => menu.select(1)}
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
        <input
          style={fieldStyle}
          value={code}
          onChange={(event) => setCode(event.currentTarget.value)}
          placeholder="방 참가 코드"
          maxLength={ROOM_CODE_LENGTH}
          spellCheck={false}
          autoCapitalize="off"
          aria-label="방 코드"
          onKeyDown={(event) => {
            if (event.key === 'Enter') join()
          }}
        />
        <MenuButton
          selected={menu.index === 2}
          onClick={join}
          onHover={() => menu.select(2)}
          disabled={!codeReady}
        >
          방 참가하기
        </MenuButton>

        <MenuButton
          selected={menu.index === 3}
          onClick={onBack}
          onHover={() => menu.select(3)}
          style={{ marginTop: 6 }}
        >
          돌아가기 (Esc)
        </MenuButton>
      </div>
    </div>
  )
}

/**
 * 줄에 서서 상대를 기다리는 동안.
 *
 * **숫자를 보여주는 것이 이 화면의 일이다.** 돌아가는 표시만 두면 기다리는 사람은
 * 고장난 것과 구분할 수 없고, 언제까지 기다려야 하는지도 모른다. 몇 명이 줄에 서
 * 있는지, 얼마나 기다렸는지, 지금 어디까지 찾고 있는지를 함께 알린다 — 특히 마지막
 * 것은 "기다리면 넓어진다"는 규칙이 실제로 움직이고 있다는 증거다.
 */
function Searching({
  status,
  onCancel,
}: {
  status: QueueStatus | null
  onCancel: () => void
}) {
  useMenuKeys({ count: 1, useTab: false, onActivate: onCancel, onCancel })

  const waiting = status?.kind === 'waiting' ? status : null
  const unreachable = status?.kind === 'unreachable'
  /*
   * 서버가 살아 있는데 이 기능만 없는 경우. "닿지 못했다"와 갈라야 한다 —
   * 사람이 할 수 있는 일이 정반대다(기다리기 vs 배포하기).
   */
  const unsupported = status?.kind === 'unsupported'

  return (
    <div style={rootStyle}>
      <div style={panelStyle} data-searching={waiting?.waitedSec ?? 0}>
        <h2 style={{ font: '700 26px/1.3 var(--sans)', color: '#f2f4fb', margin: 0 }}>
          {unsupported ? '자동 매칭을 쓸 수 없습니다' : '상대를 찾는 중…'}
        </h2>

        {unsupported ? (
          <p
            style={{ color: '#ffcf5c', margin: 0, fontSize: 15, lineHeight: 1.7 }}
            data-queue-unsupported
          >
            서버가 아직 자동 매칭을 모릅니다. 수동 매칭으로 방을 만들어 주세요.
          </p>
        ) : unreachable ? (
          <p style={{ color: '#ffcf5c', margin: 0, fontSize: 15, lineHeight: 1.7 }}>
            서버에 닿지 못했습니다. 잠시 뒤 다시 시도합니다.
          </p>
        ) : (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
              }}
            >
              <Figure label="대기 인원" value={`${waiting?.waiting ?? 1}명`} />
              <Figure label="기다린 시간" value={`${waiting?.waitedSec ?? 0}초`} />
            </div>
            <p style={{ color: '#b6bdd4', margin: 0, fontSize: 14, lineHeight: 1.7 }}>
              {bandText(waiting?.band ?? 0)}
            </p>
          </>
        )}

        <button type="button" style={ghostButtonStyle} onClick={onCancel}>
          취소 (Esc)
        </button>
      </div>
    </div>
  )
}

/** 지금 어디까지 찾고 있는지를 사람의 말로 바꾼다 */
function bandText(band: number): string {
  if (band <= 0) {
    return '같은 티어에서 찾고 있습니다. 오래 걸리면 범위를 넓힙니다.'
  }
  if (band === 1) {
    return '범위를 넓혀 옆 티어까지 찾고 있습니다.'
  }
  return '티어를 가리지 않고 찾고 있습니다.'
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: '#0d0f16',
        border: '1px solid #2e3448',
        borderRadius: 10,
        padding: '12px 14px',
        display: 'grid',
        gap: 4,
      }}
    >
      <span style={{ color: '#6a7290', fontSize: 12, letterSpacing: '0.06em' }}>{label}</span>
      <span style={{ font: '700 20px/1.2 var(--sans)', color: '#f2f4fb' }}>{value}</span>
    </div>
  )
}

export { LobbyScreen }
