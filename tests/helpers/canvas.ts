/** Drawing-call fixture; it does not simulate pixels, transforms, or text shaping. */
export function canvasContext() {
  const state = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: '',
    globalCompositeOperation: 'source-over', globalAlpha: 1,
    font: '', textAlign: '', textBaseline: '', shadowBlur: 0, shadowColor: '',
  }
  const stack: typeof state[] = []
  const noop = () => { }
  return {
    ...state,
    save() { stack.push(Object.fromEntries(Object.keys(state).map(key => [key, this[key as keyof typeof state]])) as typeof state) },
    restore() { const previous = stack.pop(); if (previous) Object.assign(this, previous) },
    setTransform: noop, clearRect: noop, translate: noop, rotate: noop, scale: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, arc: noop,
    ellipse: noop, roundRect: noop, rect: noop, clip: noop, quadraticCurveTo: noop,
    stroke: noop, fill: noop, setLineDash: noop, strokeRect: noop, fillRect: noop,
    drawImage: noop, fillText: noop,
    measureText: (_text: string) => ({ width: 0 }),
    createLinearGradient: () => ({ addColorStop: noop }),
  }
}

export function canvasFor(context: object, width = 1280, height = 800): HTMLCanvasElement {
  return {
    width: 0, height: 0,
    getContext: () => context,
    getBoundingClientRect: () => ({ width, height }),
  } as unknown as HTMLCanvasElement
}
