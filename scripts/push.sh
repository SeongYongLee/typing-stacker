#!/usr/bin/env bash
#
# 워킹 트리를 건드리지 않고 안전하게 민다.
#
# 이 저장소는 **여러 사람(또는 에이전트)이 같은 워킹 트리를 나눠 쓴다.** 그래서
# 평범한 `git pull --rebase`가 두 가지 이유로 막힌다.
#
#   1. 워킹 트리에 늘 남의 미커밋 작업이 있어 rebase가 거부된다
#   2. stash로 밀어내면 남의 작업이 사라진 것처럼 보이고, 되돌리다 충돌이 난다
#
# 그래서 **임시 워크트리**에서 커밋만 옮긴다. 워킹 트리는 처음부터 끝까지 그대로다.
#
# 미는 것보다 중요한 것이 하나 더 있다 — **밀 상태를 먼저 세워서 검사한다.**
# 실제로 이 검사가 "main이 컴파일되지 않는" 상태를 두 번 잡았다. 워킹 트리에서
# 통과하는 것과 커밋될 트리에서 통과하는 것은 다르다(남의 미커밋 파일에 기대고
# 있으면 워킹 트리에서만 돈다).
#
# 쓰기: pnpm push        (검사 후 밀기)
#       pnpm push --dry  (검사만, 밀지 않음)
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
DRY=${1:-}
TMP="$(mktemp -d)/verify"
cleanup() { git worktree remove --force "$TMP" >/dev/null 2>&1 || true; }
trap cleanup EXIT

git fetch -q origin

BEHIND=$(git rev-list --count HEAD..origin/main)
AHEAD=$(git rev-list --count origin/main..HEAD)

if [ "$AHEAD" = "0" ] && [ "$BEHIND" = "0" ]; then
  echo "이미 나란하다. 밀 것이 없다."
  exit 0
fi
if [ "$AHEAD" = "0" ]; then
  echo "밀 커밋이 없다 (원격이 $BEHIND개 앞섰다). 먼저 받아야 한다."
  exit 1
fi

# 원격이 앞섰으면 그 위로 옮긴다. 아니면 지금 HEAD를 그대로 세운다
if [ "$BEHIND" != "0" ]; then
  echo "원격이 ${BEHIND}개 앞섰다. 임시 워크트리에서 내 ${AHEAD}개를 그 위로 옮긴다."
  git worktree add -f --detach "$TMP" origin/main >/dev/null
  # 오래된 것부터 얹어야 순서가 유지된다
  git -C "$TMP" cherry-pick $(git log --format=%H origin/main..HEAD --reverse | tr '\n' ' ') >/dev/null
else
  echo "원격과 이어져 있다. 밀 상태를 그대로 세워 검사한다."
  git worktree add -f --detach "$TMP" HEAD >/dev/null
fi

# 워킹 트리의 node_modules 를 빌려 쓴다 — 다시 설치하면 몇 분이 걸린다
ln -sfn "$(pwd)/node_modules" "$TMP/node_modules"

echo
echo "── 밀 상태를 검사한다 (워킹 트리가 아니라) ──"
( cd "$TMP" && npx tsc -b --noEmit ) && echo "  타입 통과"

# 파이프로 넘기면 vitest 의 종료 코드가 tail 것으로 덮인다 — 실패해도 그냥 밀게 된다
( cd "$TMP" && npx vitest run > "$TMP/.test.log" 2>&1 ) || {
  tail -20 "$TMP/.test.log"
  echo
  echo "시험이 깨졌다. 밀지 않는다."
  exit 1
}
grep -E "Test Files|Tests " "$TMP/.test.log" | tail -2 | sed 's/^/  /'

( cd "$TMP" && npx vite build >/dev/null 2>&1 ) && echo "  빌드 통과"

NEW=$(git -C "$TMP" rev-parse HEAD)
echo
if [ "$DRY" = "--dry" ]; then
  echo "검사만 했다. 밀려면 --dry 없이 다시 실행한다. (검사한 커밋: ${NEW:0:9})"
  exit 0
fi

git update-ref refs/heads/main "$NEW"
git push origin main
echo "밀었다. 워킹 트리는 건드리지 않았다."
