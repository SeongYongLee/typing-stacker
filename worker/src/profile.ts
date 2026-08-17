/** 기기 id의 최대 길이. UUID가 36자다 */
const MAX_ID = 64
const MAX_NAME = 12

interface ProfileInput {
  id: string
  name: string
  icon: string
}

/** 물건 id로 쓸 수 있는 모양인가. 표에 있는지는 그리는 쪽이 본다 */
function iconId(raw: unknown): string {
  return typeof raw === 'string' && /^[a-z0-9-]{1,40}$/.test(raw) ? raw : ''
}

function parseProfile(raw: unknown): ProfileInput | null {
  if (typeof raw !== 'object' || raw === null) return null
  const value = raw as Record<string, unknown>
  const id = text(value['id'], MAX_ID)
  const name = text(value['name'], MAX_NAME)
  if (id === null || name === null || typeof value['icon'] !== 'string') {
    return null
  }
  const icon = iconId(value['icon'])
  if (value['icon'] !== '' && icon === '') {
    return null
  }
  return { id, name, icon }
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length === 0 || trimmed.length > max ? null : trimmed
}

export { MAX_ID, MAX_NAME, iconId, parseProfile }
export type { ProfileInput }
