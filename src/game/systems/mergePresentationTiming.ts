export const MERGE_HOLD_SECONDS = 0.55
export const MERGE_CONTACT_SECONDS = MERGE_HOLD_SECONDS + 0.15

export function mergeHoldSeconds(count: number): number { return count >= 4 ? 1 : MERGE_HOLD_SECONDS }
export function mergeStagger(count: number): number { return count >= 5 ? 0.09 : count >= 4 ? 0.06 : 0 }
export function mergeGatherEnd(count: number): number { return 0.15 + Math.max(0, count - 1) * mergeStagger(count) }

/** The frame in which the last ingredient reaches the result. */
export function mergeContactSeconds(count: number): number {
  return mergeHoldSeconds(count) + mergeGatherEnd(count)
}

export function complexMergeFocus(count: number, elapsed: number): number | null {
  const age = elapsed - mergeContactSeconds(count)
  return count >= 4 && age >= 0 && age < 0.8 ? age / 0.8 : null
}
