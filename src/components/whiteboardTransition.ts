interface WhiteboardWordChanges {
  readonly removed: readonly { readonly word: string; readonly index: number }[]
  readonly added: readonly { readonly word: string; readonly index: number }[]
}

/** 유지되는 단어는 건드리지 않고 실제로 지우고 쓸 단어만 찾는다. */
function whiteboardWordChanges(
  previous: readonly string[],
  next: readonly string[],
): WhiteboardWordChanges {
  const previousSet = new Set(previous)
  const nextSet = new Set(next)
  return {
    removed: previous.flatMap((word, index) =>
      nextSet.has(word) ? [] : [{ word, index }],
    ),
    added: next.flatMap((word, index) =>
      previousSet.has(word) ? [] : [{ word, index }],
    ),
  }
}

export { whiteboardWordChanges }
export type { WhiteboardWordChanges }
