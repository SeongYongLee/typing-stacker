const STORAGE_KEY = 'typing-stacker/pending-run/v1'

interface PendingRun {
  readonly id: string
  readonly name: string
  readonly icon: string
  readonly score: number
  readonly stackCount: number
  readonly maxHeight: number
  readonly maxCombo: number
  readonly kpm: number
  readonly durationSec: number
}

/** 네트워크가 끊겨도 최고 미전송 기록 하나는 브라우저에 남긴다. */
function queuePendingRun(run: PendingRun): PendingRun {
  const current = loadPendingRun()
  const next = current !== null && current.id === run.id && current.score > run.score ? current : run
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // 저장소가 막혀 있어도 결과 화면과 즉시 전송은 그대로 동작한다.
  }
  return next
}

function loadPendingRun(): PendingRun | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return null
    const value: unknown = JSON.parse(raw)
    return valid(value) ? value : null
  } catch {
    return null
  }
}

/** 전송 중 더 높은 기록이 새로 저장됐다면 그것까지 지우지 않는다. */
function clearPendingRun(sent: PendingRun): void {
  const current = loadPendingRun()
  if (current === null || keyOf(current) !== keyOf(sent)) return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 지우지 못하면 다음 접속 때 한 번 더 보내지만 서버는 최고 기록 하나만 남긴다.
  }
}

function keyOf(run: PendingRun): string {
  return `${run.id}|${run.score}|${run.stackCount}|${run.durationSec}`
}

function valid(value: unknown): value is PendingRun {
  if (typeof value !== 'object' || value === null) return false
  const run = value as Record<string, unknown>
  return (
    typeof run['id'] === 'string' && run['id'].length > 0 && run['id'].length <= 64 &&
    typeof run['name'] === 'string' &&
    typeof run['icon'] === 'string' &&
    finite(run['score']) && finite(run['stackCount']) && finite(run['maxHeight']) &&
    finite(run['maxCombo']) && finite(run['kpm']) && finite(run['durationSec'])
  )
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

export { STORAGE_KEY, queuePendingRun, loadPendingRun, clearPendingRun }
export type { PendingRun }
