import { useEffect, useRef } from 'react'
import { soundBoard } from '../audio/SoundBoard.ts'

/**
 * 판이 열릴 때 다른 곳을 보고 있는 사람을 불러온다.
 *
 * 방을 만들고 코드를 알려준 뒤에는 다른 탭에서 기다리게 된다. 그러다 판이 시작되면
 * **첫 차례를 그대로 날린다** — 받침대가 하나뿐이라 내 차례는 한 번뿐이고, 그것을
 * 놓치면 남들은 이미 쌓고 있다.
 *
 * 두 가지로 부른다.
 *
 * - **소리** — 탭이 숨어 있어도 오디오는 계속 난다(첫 클릭으로 이미 잠금이 풀려 있다).
 * - **탭 제목** — 소리를 껐거나 못 듣는 경우에 남는 유일한 통로다. 눈에 보이는
 *   자리가 제목뿐이라, 돌아왔을 때 원래 제목으로 되돌린다.
 *
 * 브라우저 알림(Notification)은 쓰지 않는다. 권한을 물어야 하고, 게임 하나 때문에
 * 권한 창을 띄우는 것은 부르는 값보다 비싸다.
 */
function useStartAlert(active: boolean): void {
  const original = useRef<string | null>(null)
  const blinker = useRef(0)

  useEffect(() => {
    if (!active || !document.hidden) {
      return
    }

    // 보고 있지 않은 사람에게만 소리를 낸다. 보고 있으면 화면의 셈이 이미 말해준다
    soundBoard().handle({ kind: 'turn' })

    original.current = document.title
    let on = true
    blinker.current = window.setInterval(() => {
      document.title = on ? '▶ 시작한다!' : (original.current ?? document.title)
      on = !on
    }, 700)

    const stop = () => {
      if (document.hidden) {
        return
      }
      clearInterval(blinker.current)
      if (original.current !== null) {
        document.title = original.current
      }
    }
    document.addEventListener('visibilitychange', stop)

    return () => {
      clearInterval(blinker.current)
      if (original.current !== null) {
        document.title = original.current
      }
      document.removeEventListener('visibilitychange', stop)
    }
  }, [active])
}

export { useStartAlert }
