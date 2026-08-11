import { useState } from 'react'
import titleDay from '../assets/splash/title-day.png'
import titleNight from '../assets/splash/title-night.png'
import { MenuButton } from '../components/MenuButton.tsx'
import { NameGreeting } from '../components/NameGreeting.tsx'
import { Blurb, Key, SidePanel } from '../components/SidePanel.tsx'
import { VersusTier } from '../components/RankBoxes.tsx'
import { useAutoMatch } from '../hooks/useAutoMatch.ts'
import { useLeaderboard } from '../hooks/useLeaderboard.ts'
import { useQueueSize } from '../hooks/useQueueSize.ts'
import { NameScreen } from './NameScreen.tsx'
import { loadProfile } from '../storage/profile.ts'
import { useMenuKeys } from '../hooks/useMenuKeys.ts'
import type { ReactNode } from 'react'
import { MAX_PLAYERS, ROOM_CODE_LENGTH } from '../multi/protocol.ts'
import type { SessionPhase } from '../multi/MatchSession.ts'
import type { JoinRequest } from '../hooks/useMatchSession.ts'
import type { MatchModeChoice } from '../multi/matchModes.ts'
import type { TitleTheme } from './titleTheme.ts'

import { ManualMatch } from './lobby/ManualMatch.tsx'
import { MatchCountdown } from './lobby/MatchCountdown.tsx'
import { ModeRoulette } from './lobby/ModeRoulette.tsx'
import { Notice } from './lobby/Notice.tsx'
import { ReadyRoom } from './lobby/ReadyRoom.tsx'
import { Searching } from './lobby/Searching.tsx'
import { WaitingRoom } from './lobby/WaitingRoom.tsx'
import { queueNoteStyle } from './lobby/lobbyStyle.ts'

interface LobbyScreenProps {
  phase: SessionPhase | null
  onOpen: (request: JoinRequest) => void
  onReady: () => void
  /** 준비 화면에서 한마디 한다 */
  onChat: (text: string) => void
  /** 구형 호출부 호환용. 대결 고정 중에는 사용하지 않는다. */
  onMatchMode?: (choice: MatchModeChoice) => void
  onBack: () => void
  theme: TitleTheme
}

const SPLASH_TITLES: Record<TitleTheme, string> = {
  day: titleDay,
  night: titleNight,
}

/**
 * 항목마다의 설명. 시작 화면과 같은 자리에 같은 모양으로 뜬다.
 *
 * 항목별로 눌렀을 때 알 필요가 있는 설명만 둔다. 실제 판 규칙은 준비 화면에서
 * 모드별로 다시 보여주고, 랭크/친선전의 공통 성격은 여기서 먼저 알려준다.
 */
const LOBBY_BLURBS: Partial<Record<string, readonly ReactNode[]>> = {
  name: ['같은 방에 들어온 사람에게 이 이름으로 보입니다.'],
  auto: [
    <>
      랭크 게임은 <Key>1대1</Key>로 진행합니다.
    </>,
    <>
      <Key>비슷한 티어</Key>의 상대를 찾아주고, 이긴 만큼 티어 점수가 오릅니다.
    </>,
  ],
  manual: [
    <>
      <Key>방 참가 코드</Key>를 주고받아 아는 사람과 모입니다.
    </>,
    <>최대 {MAX_PLAYERS}명까지 들어올 수 있습니다.</>,
    <>
      친선전에서는 <Key>티어 점수는 바뀌지 않습니다.</Key>
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

function LobbyScreen({
  phase,
  onOpen,
  onReady,
  onChat,
  onBack,
  theme,
}: LobbyScreenProps) {
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
   * Tab도 줄을 옮긴다. 예전에는 이 화면에 이름 칸이 있어서 Tab을 메뉴가 먹으면
   * 그 칸으로 갈 길이 막혔는데, 이름은 프로필로 옮겨가 더 이상 여기 없다.
   */
  const menu = useMenuKeys({
    count: items.length,
    // 여기 온 사람이 하려는 것은 상대를 만나는 것이다. 이름은 이미 골라둔 값이라 건드릴 일이 드물다
    initialIndex: 1,
    // 이름 화면이나 친선전이 열려 있는 동안에는 그쪽이 키를 갖는다
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
    return (
      <WaitingRoom
        roomCode={phase.roomCode}
        matchModeChoice={phase.matchModeChoice}
        onBack={onBack}
      />
    )
  }

  if (phase?.kind === 'countdown') {
    return <MatchCountdown phase={phase} />
  }

  if (phase?.kind === 'roulette') {
    return (
      <div style={{ position: 'relative', height: '100%' }}>
        <ReadyRoom
          phase={{ ...phase, kind: 'ready' }}
          onReady={onReady}
          onChat={onChat}
          onBack={onBack}
          interactive={false}
        />
        <ModeRoulette phase={phase} />
      </div>
    )
  }

  if (phase?.kind === 'ready') {
    return (
      <ReadyRoom
        phase={phase}
        onReady={onReady}
        onChat={onChat}
        onBack={onBack}
      />
    )
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
  const blurbLines = LOBBY_BLURBS[blurbKey]
  const title = SPLASH_TITLES[theme]

  /*
   * 시작 화면과 같은 뼈대를 쓴다 — 로고 / 왼쪽 인사와 버튼 / 오른쪽 티어와 설명.
   *
   * 예전에는 이 화면만 세로로 긴 한 덩어리였다. 같은 게임 안에서 화면마다 짜임이
   * 다르면 어디를 봐야 하는지를 화면마다 다시 배워야 하고, 무엇보다 들어왔다 나갈 때
   * 제목과 인사가 다른 자리로 뛴다.
   */
  return (
    <main className="title-splash__stage">
      <h1 className="sr-only">함께 하기</h1>
      <img className="title-splash__logo" src={title} alt="" aria-hidden="true" />

      <div className="title-splash__content">
        <div className="title-splash__menu">
          <NameGreeting
            name={nickname}
            icon={loadProfile().icon}
            selected={menu.index === 0}
            onSelect={() => menu.select(0)}
            onActivate={() => setNaming(true)}
          />

          {/*
            랭크 게임이 맨 위다. 아는 사람이 없어도 되는 유일한 길이라 대부분은
            이것을 누르게 된다 — 코드를 만드는 쪽이 먼저 보이면 상대를 구해와야
            하는 게임으로 읽힌다.
          */}
          <MenuButton
            selected={menu.index === 1}
            onClick={auto.start}
            onHover={() => menu.select(1)}
            primary
          >
            랭크 게임
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
            친선전
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

        <SidePanel
          kind={blurbKey}
          /*
           * 순위표는 **랭크 게임 칸에만** 세운다. 시작 화면이 쓰는 규칙과 같다 —
           * 옆에 놓인 것은 지금 고른 항목에 딸린 것이어야 한다.
           *
           * 친선전에 세우면 그 판이 순위에 걸린다는 뜻으로 읽히고(그 길은 티어에
           * 오르지 않는다), 돌아가기나 프로필에 세우면 그 항목과 아무 상관이 없다.
           */
          record={blurbKey === 'auto' ? <VersusTier board={board} /> : null}
          blurb={blurbLines === undefined ? null : <Blurb kind={blurbKey} lines={blurbLines} />}
        />
      </div>

      <p className="title-splash__hint">↑↓로 고르고 Enter로 들어갑니다</p>
    </main>
  )
}

export { LobbyScreen }
