type IconStep = -1 | 0 | 1

function iconStepForKey(key: string): IconStep {
  if (key === 'ArrowRight') return 1
  if (key === 'ArrowLeft') return -1
  return 0
}

export { iconStepForKey }
export type { IconStep }
