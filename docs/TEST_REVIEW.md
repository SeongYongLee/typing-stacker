# 테스트 전체 검토

검토일: 2026-09-13. 기준: HEAD `b3aaccb`와 당시 미커밋 작업을 포함한 작업 트리. 아래는 적용 전 검토 기록이며 행 번호·실행 수는 당시 기준이다. 반영 내용은 문서 끝의 적용 기록과 [실행 안내](TESTING.md)를 참고한다.

**결론:** 개수 자체보다 검증 대상과 유지 비용의 불균형이 문제다. 물리·입력 판정·합성·네트워크 계약 테스트는 보존하고, 스타일 상수 복사·동일 시뮬레이션 반복·테스트 내부 수식 검증을 줄이는 것이 우선이다. 테스트 파일을 합치는 것만으로 검증량이나 실행 시간이 줄지는 않는다.

검토 범위는 `tests/`의 테스트 **116파일 전체(14,284줄)**, helper 5파일, `scripts/check-*.mjs`의 브라우저 검사 5파일(302줄), 실행 설정과 CI/훅이다. 파일별 설정·입력·단언·정리 코드를 읽었고, 의심 사례는 실제 구현/호출부와 대조했다. 전체 제품 코드의 기능 감사나 커버리지/뮤테이션 점수 측정은 수행하지 않았다.

**실행 확인**

| 실행 | 결과 | 의미 |
|---|---|---|
| 기본 `pnpm test --reporter=json --outputFile=/private/tmp/typing-stacker-test-review.json` | 109파일·848개 통과, JSON 시작/종료 기준 약 6.46초 | 직전 검토에서 같은 작업 트리로 실행한 결과. CI 전체 또는 실기 검증 결과가 아님 |
| 임시 설정으로 `ModeRoulette.test.tsx` 포함 후 단독 실행 | 2개 통과 | 테스트는 유효하게 실행되지만 기본 발견 설정에서 누락 |
| `MEASURE=1 pnpm exec vitest run tests/zz-balance.measure.test.ts` | 실패, 60판 전부 입력 낙하 0; 실행 약 9.60초 | 현재 튜토리얼 진입에서 봇이 진행하지 못함 |
| `MEASURE=1 MEASURE_RUNS=1 MEASURE_MAX_SEC=180 pnpm exec vitest run tests/zz-recipe-flow.measure.test.ts` | 실패, 1판·가상 180초 입력 0·고유 단어 0·비율 NaN | 실행 수를 1로 줄여 같은 시작 문제 재현 |
| 나머지 측정 4파일 및 브라우저 검사 5파일 | 정적 검토만 수행 | 통과/실패를 주장하지 않음 |

측정 실패는 제품 게임이 고장 났다는 뜻이 아니라 **측정 봇이 현재 제품 흐름을 따르지 못한다**는 뜻이다. 기본 실행은 측정 6파일을 의도적으로 제외한다. 기본 실행에서 빠진 나머지 1파일은 TSX 발견 누락이다.

**판정 집계**

| 주 판정 | 파일 수 | 해석 |
|---|---:|---|
| 유지 | 46 | 현재 검사 목적을 보존. 준비 코드 개선은 별도로 가능 |
| 축소 | 30 | 파일 전체 삭제가 아니라 중복/장식 단언만 축소 |
| 삭제 후보 | 5 | 현재 검증 가치가 낮아 제거를 검토할 수 있는 파일 |
| 보완 | 14 | 검증이 실제로 실패를 잡도록 먼저 수정 |
| 분리 | 11 | 측정·실험 또는 현재 닫힌 기능의 검사로 명시 |
| 통합 | 10 | 동일 소유 기능으로 모으되 고유 실패 조건 보존 |

각 파일에는 가장 중요한 판정 하나를 부여했다. 예를 들어 '유지' 파일에도 fixture 공통화나 제목 수정 제안이 있다. '축소 30파일'은 30파일 삭제를 의미하지 않는다.

**우선 수정할 검증 오류**

1. **[P1] 재시작/준비방 복귀 검사가 시작 실패를 통과시킨다.** [MatchSession.test.ts](../tests/MatchSession.test.ts) 151·188행에서 처음 받은 두 phase가 playing이 아니면 단언 없이 `return`한다. 준비 상태에 머무는 회귀가 생기면 다음 판 메시지 보존과 준비방 복귀 검사가 아예 실행되지 않고 성공한다. 두 phase를 먼저 단언하거나 실패를 던지는 fixture를 사용해야 한다. 88·103행처럼 이미 `expect(kind).toBe('ready')` 뒤에 있는 타입 좁히기 return과는 구별한다.

2. **[P1] 두 밸런스 측정기는 현재 게임을 측정하지 못한다.** [zz-balance.measure.test.ts](../tests/measure/zz-balance.measure.test.ts)와 [zz-recipe-flow.measure.test.ts](../tests/measure/zz-recipe-flow.measure.test.ts)는 `engine.startRun()`을 호출한다. [GameEngine.ts](../src/game/core/GameEngine.ts) 476행의 기본 인수는 `showTutorial=true`이며 처음에는 Enter 확인을 기다려 활성 단어가 없다. 봇은 활성 단어가 있을 때만 제출하므로 영원히 진행하지 않는다. 실제 실행에서도 각각 60판/1판이 낙하 0으로 실패했다. 정식 스테이지 측정에는 `startRun(false)`와 현재 경보·회수 정책을 따른 입력 전략이 필요하다. 분모 0의 NaN 표시도 처리해야 한다. 단언을 없애 통과시키면 안 된다.

3. **[P2] TSX 테스트가 기본/CI 실행에서 빠져 있다.** [vite.config.ts](../vite.config.ts) 35행은 `tests/**/*.test.ts`만 포함한다. [ModeRoulette.test.tsx](../tests/legacy/ModeRoulette.test.tsx)의 2개는 임시 설정으로 실행하면 통과한다. 다만 현재 [matchModes.ts](../src/multi/matchModes.ts)와 [MatchSession.ts](../src/multi/MatchSession.ts)의 일반 시작 경로는 duel 고정이므로, 무조건 기본 실행에 추가하기보다 보존 모드 suite의 include를 명확히 하는 것이 적절하다. 앞선 간이 검토의 '누락 수정' 제안을 이 맥락까지 보완한다.

4. **[P2] 오디오 재개 테스트가 다른 인스턴스를 검사한다.** [AudioGate.test.ts](../tests/AudioGate.test.ts) 140행은 `tryOpen`이 실패한 `bus`를 두고 새 `AudioBus`를 만들어 `unlock`한다. 이미 존재하는 suspended 컨텍스트의 resume 경로가 고장 나도 이 테스트는 잡지 못한다. 기존 fake 컨텍스트의 resume 동작을 바꾸고 같은 bus에서 `await bus.unlock()` 후 상태를 검사해야 한다. 소리 연결을 검사하는 SplashSound와는 중복이 아니다.

5. **[P2] 레이아웃 테스트가 실제 레이아웃을 읽지 않는다.** `Viewport.test.ts` (삭제)의 `LANE_MIN`, `GAP`, `PADDING_X`, `arenaAt`은 모두 테스트 자체의 복사본이다. [GameScreen.tsx](../src/screens/GameScreen.tsx)의 grid/padding을 바꿔도 시험의 수식은 그대로여서 통과한다. 첫 두 검사도 `>=`와 `>`의 포함 관계다. 실제 DOM 경계/overflow를 검사하는 [check-input-mode.mjs](../scripts/check-input-mode.mjs)로 역할을 모으는 편이 낫다.

6. **[P2] 테스트 제목보다 좁은 상태만 검사하는 사례가 있다.** [WordSpawner.test.ts](../tests/WordSpawner.test.ts)의 'missed 단어는 페이드 후 목록에서 사라진다'는 30초 뒤 남아 있는 missed 단어들의 fade 범위만 본다. 특정 id가 missed가 된 뒤 제거되는지 확인해야 한다. [PlayerLeft.test.ts](../tests/PlayerLeft.test.ts)의 새 방장 스폰 검사는 기존 단어가 남아 있는 경우와 새 스폰을 구별하지 못한다. 새 id 또는 wordState 전송의 진행을 확인해야 한다.

7. **[P2] 렌더링 파티클 테스트에 중복과 빈 검사 가능성이 있다.** [Trails.test.ts](../tests/Trails.test.ts) 525행의 '효과 끄기'는 처음부터 꼬리가 없는 refrigerator를 사용하며 바로 다음 사례와 겹친다. 520행의 bolt 켜기/끄기 비교는 이미 존재하므로 이를 보존하면 된다. '한 프레임 시간 상한'도 미사용 `normal`을 만들고 파티클 개수 상한만 확인해 dt clamp를 직접 검증하지 않는다. `every`/파티클 순회가 핵심인 사례에는 필요한 파티클 생성 전제를 확인해야 한다.

8. **[P2] 브라우저 결과 액션 검사가 이전 클릭 결과를 재사용한다.** [check-result-layout.mjs](../scripts/check-result-layout.mjs) 45·46행은 클릭 후 `data-result-action`이 truthy인지 확인한다. 첫 클릭의 값이 남아 있어 다음 버튼이 아무 일도 하지 않아도 성공할 수 있다. 매 액션 전에 값을 지우고 버튼별로 정확한 start/tutorial/restart/home 값을 확인해야 한다. 이 스크립트는 이번에 실행하지 않았으며 단언 구조로 확인한 문제다.

9. **[P2] 현재 닫힌 기능의 비용이 일반 테스트와 섞여 있다.** 일반 세션은 duel로 시작하지만 MatchEngine의 여러 테스트는 `matchMode='shared'`를 직접 주입한다. TurnCooldown/TurnLimit 및 발판 배치·룰렛 검사도 함께 남아 있다. [matchModes.ts](../src/multi/matchModes.ts)는 복구 가능성을 주석으로 명시하므로 '미사용=즉시 삭제'로 판단하지 않았다. 보존 여부를 제품 코드와 함께 결정하고, 유지한다면 실행 그룹을 구분해야 한다. 네트워크 파서의 구형 shared/roulette 수용은 호환성 계약이므로 같이 지우면 안 된다.

10. **[P2] Rapier World 해제가 누락되어 있다.** [PhysicsKeyframe.test.ts](../tests/PhysicsKeyframe.test.ts)는 beforeEach마다 World 두 개를 만들지만 해제 hook이 없다. PhysicsSync·PhysicsWorld·Merge.physics·Sticky도 beforeAll로 만든 World를 afterAll에서 해제하지 않는다. [PhysicsWorld.dispose](../src/game/physics/PhysicsWorld.ts)는 실제 WASM `world.free()`를 호출한다. 일회 실행에서 메모리 증가를 계측한 것은 아니지만 watch/반복 실행의 자원 수명을 명시해야 한다. 단언 뒤의 dispose만 있는 엔진 테스트는 실패 때도 finally/afterEach로 정리하도록 한다.

**확인된 중복과 축소 방법**

| 위치 | 겹치는 검증 | 남겨야 할 고유 범위 |
|---|---|---|
| PhysicsSync ↔ PhysicsKeyframe | 없는 body 생성·권위에서 빠진 body 제거 | 멱등 적용, 기존 위치 수정, 구형 frame 상태 보존, 현재 속도/잠듦/관절 복원 |
| Recall ↔ CongestionCombo | congestion 40에서 정상 입력 후 38, recoverySeq=1 | 회수 자체·튜토리얼·스테이지 전환; 콤보 구간별 회복은 CongestionCombo가 소유 |
| MatchState ↔ TurnCooldown | 첫 차례, canDrop의 차례 제한, 종료 후 낙하 불가 | 턴 순환, 탈락자 건너뛰기, setTurn, 순위/생명 |
| MatchId 내부 마지막 2개 | MAX_PLAYERS 세션을 두 번 생성 | 하나의 8인 실행에서 id 일치와 길이 동시 확인 |
| MatchSession ↔ ManyPlayers ↔ Ranked | 명단, 한쪽 준비, 시작, 친선 ranked=false | 3명 이상에서 명단 덮어쓰기 방지와 준비자 이탈은 그대로 보존 |
| TurnLimit 내부 | timeout 뒤 낙하·턴 전환·게스트 수량을 각각 같은 준비로 실행 | 한 timeout 시나리오에 합치고 정상 입력 시 리셋은 별도 |
| ItemResolver 내부 | 모든 단어 기본형 선택 + 같은 함수 600회 및 단어당 60회 | 전 단어 1회씩 기본형 확인, 알 수 없는 단어 거부, 합성 확률의 RNG 경계 |
| Merger ↔ artSizes | 레시피 결과의 artBounds 상한 | 전체 ALL_VARIANTS 상한은 artSizes에 일원화. shapes의 collider 상한은 다른 값이므로 유지 |
| Sticky ↔ PhysicsWorld | 끈적한 물건의 빈 받침대 안정성 | 옆면 매달림·관절 생성/정리·sticky=false 비교는 Sticky에 유지 |
| materials 내부 | (tone,grain) 쌍 유일성 ↔ 같은 tone 안 grain 유일성 | 하나의 유일성 검사 + 재질 참조·실제 음높이 간격 계약 |
| matching 내부 | '혼자면 안 붙음' ↔ '자기 자신과 안 붙음' 둘 다 1명 입력 | 동일 device가 두 행인 입력을 써서 후자를 실질적인 별개 검사로 수정 |
| WordSpawner 내부 | 240초·60fps 루프를 3번 수행 | 여러 seed의 한 관측 루프에서 중복 글자/슬롯/용량을 함께 검사 |
| WordDensity 내부 | 정수 maxConcurrent <= MAX와 < MAX+1 | 실제 레인 용량 계약 하나 |
| ReadyRoom 내부 | 동일 친선 duel 마크업을 반복해 같은 설명 확인 | manual/auto/구형 roulette 호환 상태표 하나 |

삭제 후보는 ArenaClock·MenuButton·NameScreen·Viewport·IconPickerKeys **5파일, 합계 156줄·12개 테스트**다. 전부 즉시 삭제하자는 뜻은 아니다. IconPickerKeys는 작은 키 매핑 계약을 보존할지 판단할 수 있고, InputBar는 폰트 일치라는 가치가 있어 삭제 대신 축소로 분류했다. 실제 절감의 큰 부분은 1~2개짜리 파일 삭제보다 901줄 Trails와 반복된 Canvas/멀티 fixture 정리에서 나올 가능성이 있다. 절감률은 구현 전 추정하지 않았다.

**준비 코드와 실행 설정**

| 대상 | 판정 |
|---|---|
| tests/helpers/frameClock.ts | 유지. rAF와 메시지 큐를 실제 벽시계 없이 진행하는 기반이다. advance가 프레임 수를 반올림하고 최소 1프레임을 돌린다는 점을 시간 경계 시험에서 고려한다. 무조건 waitForTimeout으로 교체하지 않는다 |
| tests/helpers/hub.ts | 유지. 다인 입장·이탈·복귀·방장 승계 재현에 필요하다. JSON 복사는 하지만 parseMessage를 거치지 않으므로 프로토콜 파서 통합까지 검증한다고 해석하지 않는다 |
| tests/helpers/delayedLoopbackTransport.ts | 유지. 지연 및 parseMessage 왕복을 실제로 적용하므로 일반 Hub와 고유 역할이 있다 |
| tests/helpers/RecallSupply.ts | 실험 코드로 분리. 제품 코드가 사용하지 않는다. 실험이 사용 중일 때는 해당 테스트를 버리지 않는다 |
| tests/helpers/recallFlowExperiment.ts | 실험 코드로 분리. 메서드 교체·스테이지 데이터 변경은 제품 정상 경로 검증과 구별하고 복원을 보장한다 |
| ArenaGlow / HiddenTagPadding / LedgeForming / DuelGoal / Trails | 반복된 Canvas mock/기본 draw 상태를 작은 helper로 공유. save/restore가 no-op이므로 Canvas 상태 스택 복원이나 실제 픽셀을 검증한다고 주장하지 않는다 |
| MatchEngine / MatchDropTick / TurnLimit 등 | 생성·listener 연결·상태 확보·dispose를 공통 fixture로 정리하되 seed·모드·지연·채팅 차이를 인자로 노출한다. 테스트 분기를 숨기는 만능 fixture는 피한다 |
| PendingRun / ProfileSync / displaySettings / manualName | 공통 MemoryStorage 및 일관된 전역 복원 사용 가능. 파일마다 임의 globalThis 캐스팅을 반복하지 않는다 |
| vite.config.ts | 측정 기본 제외 유지. TSX 누락/보존 모드 그룹을 명시. '157초 중 136초'는 과거 측정이며 현재 기본 실행 시간으로 인용하지 않는다 |
| package.json | 기본 test와 test:measure는 구분되어 있다. 브라우저 검사 명령이 없으며, MEASURE_FLOW 이중 활성화도 별도 명령/문서가 필요하다 |
| .github/workflows/ci.yml | typecheck/lint/pnpm test만 실행한다. TSX/측정/브라우저 검사까지 통과했다는 의미는 아니다 |
| .githooks/pre-commit | staged 트리와 --changed 검사 의도 유지. 반복된 실행을 줄이기 위해 필요한 검증을 삭제할 이유는 없다 |
| scripts/push.sh | 별도 트리의 테스트 실행은 미커밋 의존성을 잡는 목적이므로 작업 트리 테스트와 단순 중복으로 삭제하지 않는다. 이번 검토에서 실행하지 않았다 |

**브라우저 검사 5파일**

| 파일 | 판정 | 구체적 제안 |
|---|---|---|
| [check-input-mode.mjs](../scripts/check-input-mode.mjs) | 유지 | 799/800 경계·touch/마우스·사용자 설정·실제 overflow를 검사한다. Viewport의 복사 수식을 대체하는 검사로 활용. 튜토리얼 전체 문구 매칭은 줄인다 |
| [check-menu-ui.mjs](../scripts/check-menu-ui.mjs) | 축소 | 실제 computed style 일치·dialog 내부 포커스·Escape 후 포커스 복귀가 가치 있다. 버튼 signature 전체의 엄격한 일치와 48px 고정은 필요한 계약만 남기고 1800ms screenshot 대기는 진단 실행으로 분리 |
| [check-mobile-start.mjs](../scripts/check-mobile-start.mjs) | 유지/보완 | 최초 시작·키보드 공간 변경·blur·재시작 취소는 SSR로 대체 불가. Vite 변환 문자열 치환 성공을 검사하고 고정 대기를 상태 조건으로 줄인다 |
| [check-result-layout.mjs](../scripts/check-result-layout.mjs) | 보완 | 실제 버튼 뷰포트 경계는 유지. 클릭 액션별 정확한 값 검사, 결과 속성 초기화, main.tsx 치환 성공 검증 필요 |
| [check-tutorial-flow.mjs](../scripts/check-tutorial-flow.mjs) | 유지/보완 | 실제 입력→낙하→합성→회수→경보→종료 경로로 내부 상태를 직접 바꾸는 단위 사례를 보완한다. 500/900ms 고정 대기는 상태/쿨타임 조건으로 줄이고 치환 실패를 즉시 알린다 |

브라우저 검사는 외부 HTTP 요청을 차단하며 실제 입력/레이아웃을 다루지만, 이번에는 코드를 읽는 검토만 수행했다. `fill`+`press('Enter')`와 뷰포트 에뮬레이션은 실제 한글 IME 조합 순서나 OS 가상 키보드의 완전한 재현이 아니다. 기존 검사를 재사용/보완하는 것이 우선이며 SSR 스타일 검사를 줄인다고 모든 상호작용 테스트를 새로 만들 필요는 없다.

**측정 해석에서 주의할 부분**

- `zz-contact`의 gathered는 `Set<recipeId>`의 크기이고 merged는 발생 횟수다. 서로 단위가 달라 merged/gathered를 '닿아서 합쳐진 비율'로 읽을 수 없다. 같은 레시피를 여러 번 합치면 100%를 넘을 수 있다. 시도 건수 기준으로 맞추거나 서로 다른 지표로 출력해야 한다.
- `zz-recipe-flow`는 입력 성공 이벤트 전에 itemHistory/uniqueWords/nonIngredientDrops를 누적한다. 입력이 무시되거나 쿨타임이면 실제 드롭과 집계가 다를 수 있다. '입력 드롭당' 지표는 성공한 drop 이벤트로 계산해야 한다.
- `whiteboard-flow`의 `baseCommit:'b3aaccb'`는 현재 HEAD와 같아도 작업 트리의 미커밋 변경을 표현하지 않는다. `installStageExperiment`는 baseline에서도 stage1 목표를 20으로 덮어쓴다. '현재 제품 그대로'가 아니라 실험 기준이며 실제 stage 설정/변형/작업 트리 식별을 결과에 남겨야 한다.
- `zz-bounce`는 3목숨 중앙 조준, `zz-bowl`은 18회 고정 낙하, `zz-contact`는 WORDS 무작위 직접 공급을 사용한다. 물리 비교 실험으로는 의미 있지만 현재 싱글 플레이 시간/클리어율로 해석하지 않는다.

**권장 적용 순서**

1. 검증 없이 통과하는 return, 측정 봇 시작 경로, 브라우저 액션 단언을 먼저 수정한다.
2. CSS/문구 고정 단언과 확정된 중복을 제거한다. 기능 계약을 남기는 범위에서만 줄인다.
3. Canvas·멀티·저장소 fixture를 공통화하고 실패 시 자원 해제를 보장한다.
4. 측정·실험·보존 기능을 실행 그룹으로 명시한다. 일반 테스트에서 뺀 검사는 어디서 돌리는지 함께 정한다.
5. 기존 브라우저 검사에 실행 명령을 마련하고, 단위 테스트가 보장하지 않는 핵심 흐름 검증으로 사용한다.

**116파일 개별 판정**

'기본 실행' 건수는 Vitest의 매개변수화 이후 assertionResults를 사용했다. 측정 파일은 '측정 제외', ModeRoulette는 '누락(별도 2개 통과)'다. 파일 수/줄 수를 테스트 가치의 점수로 사용하지 않았다.

| 파일 | 줄 수 | 기본 실행 | 주 판정 | 근거와 처리 방향 |
|---|---:|---:|---|---|
| [Aimer.test.ts](../tests/Aimer.test.ts) | 42 | 5 | 유지 | 왕복·등속·범위 경계를 검사한다. 5개 모두 조준 규칙에 직접 연결된다. |
| [ArenaBackdrop.test.ts](../tests/ArenaBackdrop.test.ts) | 57 | 4 | 축소 | 안내 표시/숨김·회수자 표시는 유지. 29행 테스트의 좌표·색·글꼴 상수 단언은 제거 후보. |
| `ArenaClock.test.ts` (삭제) | 24 | 2 | 삭제 후보 | 2개 모두 CSS 문자열만 고정한다. 실제 시계 계산은 DayNight가 검증한다. |
| [ArenaGlow.test.ts](../tests/ArenaGlow.test.ts) | 216 | 7 | 유지 | 순수 색 계산과 다른 렌더러 연결 검증이다. 화면 전체 칠·multiply·효과 끄기를 유지하고 Canvas fixture를 공유한다. |
| [ArenaPlatform.test.ts](../tests/ArenaPlatform.test.ts) | 33 | 1 | 유지 | 단계별 물리 폭과 그림 비율·바닥 정렬의 계약이다. 장식 크기 고정과 구별한다. |
| [AudioGate.test.ts](../tests/AudioGate.test.ts) | 171 | 7 | 보완 | tryOpen 실패 뒤 같은 bus를 unlock하도록 수정. 마지막 2개의 음량 상수 검사는 오디오 출력 검증으로 묶는다. |
| [AutoMatch.test.ts](../tests/AutoMatch.test.ts) | 227 | 6 | 유지 | 실제 open 경로의 자동매칭 전용 플래그·준비 시한·채팅 제한을 검사한다. attach 테스트와 중복이 아니다. |
| [AutoMatchCancel.test.ts](../tests/AutoMatchCancel.test.ts) | 29 | 2 | 유지 | 검색 중/이미 중단된 상태의 취소 차이를 검사한다. 2개가 짧고 회귀 목적이 분명하다. |
| [BodyCorrection.test.ts](../tests/BodyCorrection.test.ts) | 65 | 5 | 유지 | 권위 위치 보간·회전 경계·보정 재진입·꼬리 억제는 서로 다른 실패 조건이다. |
| [Camera.test.ts](../tests/Camera.test.ts) | 91 | 10 | 축소 | 스폰 간격 일정/항상 탑 위 두 검사를 합칠 수 있다. 추종·하강·큰 dt·렌더 범위 검증은 유지. |
| [CanvasResolution.test.ts](../tests/CanvasResolution.test.ts) | 21 | 3 | 유지 | DPR·픽셀 예산·0 크기를 검사한다. 성능 상한을 보호하는 작은 테스트다. |
| [CatPickup.test.ts](../tests/CatPickup.test.ts) | 212 | 19 | 축소 | 마리 수·수명·리셋·좌우·난수·물기 전후는 유지. 자세의 세부 상수는 축소하고 좌우 사례는 매개변수화 가능. |
| [Catcher.test.ts](../tests/Catcher.test.ts) | 119 | 8 | 유지 | 회수 위치·탑 충돌 방지·좌우 대칭을 검사한다. 물리 통합 테스트와 역할이 다르다. |
| [CatcherPaint.test.ts](../tests/CatcherPaint.test.ts) | 71 | 5 | 축소 | 200px 이동·3.24배 공식을 그대로 옮긴 처음 2개는 제거 후보. 대칭·진입 방향·물건/손 정렬은 유지. |
| [ChatLog.test.ts](../tests/ChatLog.test.ts) | 83 | 8 | 유지 | 정제·길이·연타 제한·최대 기록·참조 안정성 모두 사용 중인 계약이다. |
| [ComboBreak.test.ts](../tests/ComboBreak.test.ts) | 110 | 4 | 유지 | 단어 만료/오타가 실제 엔진에서 콤보·경보를 바꾸는 경로를 보호한다. ScoreManager와 중복 삭제하지 않는다. |
| [CompactCamera.test.ts](../tests/CompactCamera.test.ts) | 21 | 3 | 유지 | 모바일 최소 가독성·탑 여유·0 크기를 확인한다. 수식 복사 부분은 화면 검사와 역할을 구분한다. |
| [CongestionCombo.test.ts](../tests/CongestionCombo.test.ts) | 77 | 9 | 유지 | 회복량 구간 경계·오타 후 복구·초과 회복 미이월·0 경보를 구분한다. Recall의 중복 검사를 이곳으로 모은다. |
| [Countdown.test.ts](../tests/Countdown.test.ts) | 175 | 6 | 보완 | 셈·중복 ready·룰렛 요청 호환·dispose는 유지. 0초 사례는 세션 시작과 통합 가능; 3초 종료 시 실제 playing 전환 검증이 없다. |
| [DayNight.test.ts](../tests/DayNight.test.ts) | 46 | 5 | 축소 | 밝기 끝값과 경계 연속성은 한 표로 묶을 수 있다. 국면·clamp·시계 연결은 유지. |
| [Difficulty.test.ts](../tests/Difficulty.test.ts) | 116 | 15 | 축소 | 진행도 6개 중 단순 끝값은 표로 묶는다. 보간·밀도·레인 용량 관계는 유지하며 체감 상한은 별도 튜닝 기준으로 관리 가능. |
| [DuelFeedback.test.ts](../tests/DuelFeedback.test.ts) | 20 | 2 | 유지 | 탈락/생존 결과 매핑 2개로 작고 명확하다. 문구 변경을 의도적으로 확인할 계약만 남긴다. |
| [DuelGoal.test.ts](../tests/DuelGoal.test.ts) | 191 | 3 | 축소 | 생존 표시·내 타워 구분은 유지. 사라진 목표선의 dash 12,7 등 과거 그리기 명령 고정은 제거 후보; Canvas fixture 중복이 크다. |
| [DuelRace.test.ts](../tests/DuelRace.test.ts) | 52 | 4 | 유지 | 동시 탈락·공동 순위·마지막 생존자·무승부는 핵심 대결 규칙이다. |
| [DuelTowers.test.ts](../tests/DuelTowers.test.ts) | 60 | 4 | 유지 | 인원 상한·내 타워·같은 시드·마지막 생존자 표시를 각각 보호한다. |
| [FocusedRecall.test.ts](../tests/experiments/FocusedRecall.test.ts) | 36 | 3 | 분리 | 제품이 아닌 recallFlowExperiment의 실험 규칙 3개다. 실험 도구 검증으로 이동하고 실험 종료 때 함께 정리한다. |
| [GameEngineRecipeFlow.test.ts](../tests/GameEngineRecipeFlow.test.ts) | 55 | 1 | 유지 | 프레임마다 재료를 재계산하지 않는 성능 회귀를 보호한다. 내부 spy가 필요한 이유가 있다; dispose를 실패 시에도 보장한다. |
| [GameEvents.test.ts](../tests/GameEvents.test.ts) | 178 | 5 | 유지 | 충돌 이벤트와 엔진→연출 연결을 검사한다. 테스트 이름의 '놓치는 흐름'은 실제 검사 범위와 맞추고 물리/엔진 fixture를 정리한다. |
| [GameLoop.test.ts](../tests/GameLoop.test.ts) | 66 | 1 | 보완 | 숨겨진 탭의 시간 진행·렌더 억제는 유지. 업데이트 20회 고정보다 각 dt 상한+누적 시간으로 표현하면 구현 결합이 줄어든다. |
| [HiddenTagPadding.test.ts](../tests/HiddenTagPadding.test.ts) | 183 | 3 | 유지 | 글자 길이에 따른 실제 그리기 좌표 관계를 검증한다. 183줄 중 Canvas 준비 코드가 커 fixture 공통화 대상이다. |
| `IconPickerKeys.test.ts` (삭제) | 11 | 1 | 삭제 후보 | 11줄의 키→숫자 매핑만 재진술한다. 아이콘 이동/선택/경계의 상호작용 검증이 있다면 그쪽으로 흡수; 현재 그 보장은 아님. |
| [ImpactFeel.test.ts](../tests/ImpactFeel.test.ts) | 85 | 8 | 축소 | 충돌 이벤트의 필드 전달 4개는 하나의 계약 객체 검사로 합칠 수 있다. 세기 clamp·소리/부스러기 일치·지진 경계 유지. |
| [InputBar.test.ts](../tests/InputBar.test.ts) | 31 | 1 | 축소 | 입력과 측정자의 폰트 일치는 가치가 있다. 폰트명 등장 횟수 2와 28px 고정 대신 두 요소의 실제 스타일 일치로 대체 후보. |
| [ItemCatalog.test.ts](../tests/ItemCatalog.test.ts) | 15 | 1 | 보완 | 생성 카탈로그와 게임 데이터의 일치는 유지. '타이틀 번들에 shape 미포함'은 검사하지 않으므로 이름을 좁힌다. |
| [ItemResolver.test.ts](../tests/ItemResolver.test.ts) | 132 | 13 | 축소 | 순수 resolveItem을 600회/단어당 60회 호출하는 반복을 제거. 전 단어 기본형 일치 하나로 통합; 확률 선택은 주입 RNG 경계로 축소. |
| [Ledge.test.ts](../tests/legacy/Ledge.test.ts) | 249 | 18 | 분리 | 배치 규칙은 유효하지만 현재 일반 싱글의 합성 발판 보상은 제거된 상태다. 보존 기능 테스트로 구분; null 건너뛰는 충돌 사례는 성립 확인 필요. |
| [LedgeForming.test.ts](../tests/legacy/LedgeForming.test.ts) | 186 | 2 | 분리 | 형성 종료/정착 좌표 일치는 의미가 있다. 보존 발판 기능 검사로 분류하고 Canvas 준비 코드를 공유한다. |
| [LedgeGrowth.test.ts](../tests/LedgeGrowth.test.ts) | 53 | 1 | 보완 | 현재 규칙 '합성해도 발판 없음'은 유지. 120초 봇 대신 고정 재료로 실제 합성을 만들고 같은 단언을 적용한다. |
| [LobbyScreen.test.ts](../tests/LobbyScreen.test.ts) | 66 | 2 | 축소 | 랭크/친선전 설명 분기는 유지 가능. 전체 문장 고정보다 선택된 설명 영역을 확인하고 중복 문구 단언을 줄인다. |
| [ManualMatch.test.ts](../tests/ManualMatch.test.ts) | 30 | 2 | 축소 | 방 생성/참가 액션 표시 유지. grid 문자열 및 예전 안내 문구 부재 검사는 제거 후보. |
| [ManyPlayers.test.ts](../tests/ManyPlayers.test.ts) | 147 | 6 | 통합 | MatchSession과 2/3/8명 fixture를 공유하고 명단·준비 공통 검사를 매개변수화. 셋째 입장·나간 준비자 제거는 반드시 보존. |
| [MatchCountdown.test.ts](../tests/MatchCountdown.test.ts) | 56 | 2 | 축소 | 내 위치/첫 차례/모드 분기는 유지. opacity·grid 문자열 제거; shared 분기는 보존 모드로 구분한다. |
| [MatchDropTick.test.ts](../tests/MatchDropTick.test.ts) | 158 | 4 | 유지 | 프레임 간격·미래 tick·늦은 메시지·정착 후 sync는 각각 필요하다. 첫 테스트의 수동 정리를 finally로 보장한다. |
| [MatchEngine.test.ts](../tests/MatchEngine.test.ts) | 783 | 35 | 보완 | 35개에 대결·shared·채팅·재시작·권위 검증이 섞였다. 대결 핵심과 보존 shared를 구분하고 drop/키프레임 전제의 비어 있는 통과를 막는다. |
| [MatchId.test.ts](../tests/MatchId.test.ts) | 134 | 9 | 통합 | 8인 세션을 두 번 여는 마지막 2개는 한 번의 시작에서 동일 id와 길이를 함께 확인. 순수 id 규칙은 유지. |
| [MatchSession.test.ts](../tests/MatchSession.test.ts) | 215 | 7 | 보완 | 151·188행의 playing 실패 시 단언 없는 return을 제거한다. 재시작/준비방 복귀는 삭제하면 안 되는 실제 경로 검증. |
| [MatchStarter.test.ts](../tests/MatchStarter.test.ts) | 27 | 3 | 통합 | 작은 시작자 계산은 MatchState/모드 관련 테스트와 묶을 수 있다. 시드 다양성·빈 명단 경계 유지. |
| [MatchState.test.ts](../tests/MatchState.test.ts) | 192 | 21 | 축소 | TurnCooldown의 첫 차례/canDrop 중복을 제거. 반 칸 노림 사례는 현재 호출부가 amount 기본값만 쓰므로 보존 API 검사로 축소. |
| `MenuButton.test.ts` (삭제) | 25 | 4 | 삭제 후보 | 4개 모두 font-size:15px 하나를 고정. 실제 버튼 스타일 일치는 check-menu-ui가 브라우저에서 검사한다. |
| [Merge.physics.test.ts](../tests/Merge.physics.test.ts) | 184 | 8 | 보완 | 접촉→합성→재료 제거·결과 안정성은 유지. 교차 레시피 하나라도 성공하면 return하는 검사는 대표 레시피를 고정하고 World를 해제한다. |
| [MergeReveal.test.ts](../tests/Merger.test.ts) | 41 | 3 | 통합 | 레시피 데이터 무결성을 Merger의 데이터 검증과 묶는다. GATHER_DIRECTIONS=6은 테스트의 복사 상수여서 실제 렌더 변경을 추적하지 못한다. |
| [Merger.test.ts](../tests/Merger.test.ts) | 391 | 30 | 축소 | 그래프 연결·우선순위·히든 대체·사전 필터는 유지. 같은 입력 20회 반복 축소; 결과 artBounds 상한은 artSizes의 전 변형 검사와 중복. |
| [ModeRoulette.test.tsx](../tests/legacy/ModeRoulette.test.tsx) | 37 | 누락(별도 2개) | 분리 | 기본 include에서 누락되며 현재 세션은 룰렛을 생성하지 않는다. 보존 모드 suite로 명시하거나 컴포넌트 폐기 때 함께 삭제; 별도 실행 2개 통과. |
| [MultiplayerLoading.test.ts](../tests/MultiplayerLoading.test.ts) | 28 | 1 | 유지 | SSR에서 Suspense 대체 UI가 존재함을 확인하는 작은 검사다. 실제 청크 로딩 완료나 브라우저 전환을 보장한다고 해석하지 않는다. |
| `NameScreen.test.ts` (삭제) | 19 | 1 | 삭제 후보 | 안내 문장 순서·과거 문구 부재만 검사. indexOf=-1이면 누락된 첫 문장도 순서 검사를 통과할 수 있다. |
| [PairMarks.test.ts](../tests/PairMarks.test.ts) | 185 | 14 | 유지 | 재료 개수·히든 대체·표식 충돌·색 번호 안정성을 보호한다. Merger와 결과 소비자가 달라 단순 중복이 아니다. |
| [PendingRun.test.ts](../tests/PendingRun.test.ts) | 126 | 3 | 유지 | 오프라인 재전송·더 높은 기록 보존·오래된 완료 응답의 삭제 방지 유지. MemoryStorage는 ProfileSync와 공유 가능. |
| [PhysicsKeyframe.test.ts](../tests/PhysicsKeyframe.test.ts) | 194 | 7 | 통합 | PhysicsSync와 생성/삭제 검사를 합친다. 버전별 운동 상태·관절 복원·가짜 impact 억제는 고유; 매 테스트 2개 World 해제 추가 필요. |
| [PhysicsSync.test.ts](../tests/PhysicsKeyframe.test.ts) | 137 | 7 | 통합 | 키프레임 검사 소유 파일을 하나로 정한다. 멱등성·위치 수정·미지 id는 남기고 isQuiet는 PhysicsWorld로 이동 가능. |
| [PhysicsWorld.test.ts](../tests/PhysicsWorld.test.ts) | 315 | 21 | 유지 | 실제 Rapier 안정성·이탈 단발·회수·owner는 고가치. halfExtentY는 shapes로 모으고 기본 World afterAll 해제를 보장한다. |
| [PlayerLeft.test.ts](../tests/PlayerLeft.test.ts) | 237 | 9 | 보완 | 유예·복귀·방장 승계 모두 유지. '새 방장이 단어를 낸다'는 남은 단어 비교뿐이라 새 단어 id/전송 메시지로 확인해야 한다. |
| [PollDelay.test.ts](../tests/PollDelay.test.ts) | 68 | 6 | 보완 | 점진 폴링과 서버 TTL 미만 계약 유지. SERVER_STALE_MS=6000 복사값은 서버 변경에 따라가지 않으므로 공통 계약으로 연결한다. |
| [Presence.test.ts](../tests/Presence.test.ts) | 90 | 9 | 유지 | 유예 만료·단발 처리·복귀·승계 후보 선택은 싸고 명확하다. PlayerLeft는 엔진 연결을 검사하므로 함께 유지. |
| [ProfileSync.test.ts](../tests/ProfileSync.test.ts) | 96 | 3 | 유지 | 현재 프로필 전송·미전송 기록 이름 갱신·조회 중복 요청 방지를 보호한다. 저장소 mock만 공유. |
| [Ranked.test.ts](../tests/MatchSession.test.ts) | 95 | 2 | 통합 | 친선전 ranked=false를 MatchSession의 실제 시작 사례에 합친다. 속성 존재만 검사하는 두 번째 사례는 삭제 후보. |
| [ReadyRoom.test.ts](../tests/ReadyRoom.test.ts) | 109 | 8 | 축소 | 처음 3개의 글꼴·높이·폭 검사 제거 후보. 동일한 친선 대결 설명 검사는 합치고 랭크/친선/구형 룰렛 호환을 남긴다. |
| [Recall.test.ts](../tests/Recall.test.ts) | 375 | 9 | 축소 | 경보 회복 신호는 CongestionCombo와 중복. 튜토리얼·회수·스테이지 전환을 논리별로 정리; 4/4 제목 및 내부 직접 호출의 범위를 수정한다. |
| [RecallSupply.test.ts](../tests/experiments/RecallSupply.test.ts) | 18 | 3 | 분리 | 실험 helper의 도달 가능성·재료 공급 검사다. 제품 회귀 수에서 분리하고 실험 사용 중에는 유지한다. |
| [RecipeFlow.test.ts](../tests/RecipeFlow.test.ts) | 190 | 12 | 유지 | 재료 노출·ambient·연쇄/히든 대체·결정성을 보호한다. 상수 고정 2개 정도는 분포/간격 계약으로 좁힐 수 있다. |
| [RenderCulling.test.ts](../tests/RenderCulling.test.ts) | 41 | 2 | 유지 | 보이는 물건 유지·화면 밖 제거의 작은 성능 계약이다. |
| [Rng.test.ts](../tests/Rng.test.ts) | 42 | 5 | 유지 | 결정성·서로 다른 seed·범위·빈 pick 경계를 확인한다. 난수 모듈이므로 수열 반복은 목적이 있다. |
| [RunValidation.test.ts](../tests/RunValidation.test.ts) | 57 | 7 | 유지 | 정상 장기 기록 승인과 불가능한 기록 거부를 구분한다. 프로필 검증은 파일명/describe 범위만 정리 가능. |
| [ScoreManager.test.ts](../tests/ScoreManager.test.ts) | 218 | 20 | 축소 | 점수·정확도·콤보·리셋은 유지. lives 단순 전달은 stats 계약 사례에 합칠 수 있고 중복된 기본 점수 단언을 줄인다. |
| [SingleClock.test.ts](../tests/SingleClock.test.ts) | 41 | 1 | 보완 | 싱글 배경 시계 계약 유지. 점수를 한 번도 바꾸지 않으므로 '점수와 무관'은 같은 시각의 서로 다른 점수로 확인하거나 이름을 좁힌다. |
| [SoloRulesScreen.test.ts](../tests/SoloRulesScreen.test.ts) | 24 | 1 | 축소 | 선택지 표시만 남기고 글꼴·세부 안내 문구를 제거. 키보드 선택을 실행하지 않으므로 테스트 제목의 보장 범위를 수정한다. |
| [SoloStages.test.ts](../tests/SoloStages.test.ts) | 66 | 7 | 축소 | 후보 풀·레시피 재료·난이도 방향은 유지. 시간표/수량을 그대로 옮긴 4개는 단일 의도된 밸런스 계약으로 묶거나 튜닝 검증으로 분리. |
| [SoundLimiter.test.ts](../tests/SoundLimiter.test.ts) | 95 | 7 | 유지 | 연타·종류별 독립·충돌 창 상한·리셋은 실제 음량 폭주를 막는다. |
| [SplashSound.test.ts](../tests/SplashSound.test.ts) | 116 | 2 | 유지 | 첫 unlock의 지연 음 재생과 열림/닫힘 순서는 고유 통합 검사다. 가짜 오디오 컨텍스트만 공유 가능. |
| [SplashTransition.test.ts](../tests/SplashTransition.test.ts) | 22 | 3 | 축소 | 첫 BGM과 화면 전환 타이밍 관계는 유지 가능. 600ms/300ms 고정은 실제 전환 실행을 보장하지 않으므로 디자인 튜닝 계약으로 구분. |
| [Standings.test.ts](../tests/MatchState.test.ts) | 122 | 7 | 통합 | MatchState 순위 영역으로 모을 수 있다. 공동 순위·setLives는 유지; 제거된 노림 반 칸 사례는 일반 damage 사례와 통합. |
| [Sticky.test.ts](../tests/Sticky.test.ts) | 317 | 20 | 축소 | 관절 생성/제거·매달림·무게 분류 유지. 빈 받침대 안정성은 PhysicsWorld 전 변형 검사에 포함; stackTop은 물리 suite로 이동. |
| [SyncMessage.test.ts](../tests/SyncMessage.test.ts) | 95 | 10 | 유지 | 복원 전에 파괴적 프레임을 통째로 거부하는 프로토콜 계약이다. PhysicsKeyframe의 적용 테스트와 다른 계층이다. |
| [Trails.test.ts](../tests/Trails.test.ts) | 901 | 65 | 축소 | 65개/901줄에 데이터·파티클·렌더 통합 혼재. 중복 분사 방향·냉장고 끄기 검사·세부 튜닝 단언을 줄이고 빈 배열 통과·dt 검증을 보완. |
| [TurnCooldown.test.ts](../tests/MatchState.test.ts) | 79 | 8 | 통합 | MatchState와 첫 차례/canDrop 중복. 턴 순환·탈락 건너뛰기·권위 setTurn을 남겨 같은 소유 파일로 합친다; 실제 cooldown 테스트는 아님. |
| [TurnLimit.test.ts](../tests/legacy/TurnLimit.test.ts) | 150 | 5 | 통합 | 동일한 timeout 시뮬레이션 3개를 자동 낙하·턴 전환·게스트 일치 한 흐름으로 묶는다. 남은 시간·정상 입력 사례는 별도 유지. |
| [TypingJudge.test.ts](../tests/TypingJudge.test.ts) | 55 | 6 | 유지 | 한글 전체 일치·공백·만료·부분 일치·우선순위 모두 핵심 입력 판정이다. |
| [TypingLane.test.ts](../tests/TypingLane.test.ts) | 127 | 7 | 축소 | claim·합성 표식·모드별 회수 아이콘 유지. 글꼴·테두리 px·광원 rgba·원 개수 고정은 제거/축소 후보. |
| [TypingSpeed.test.ts](../tests/TypingSpeed.test.ts) | 42 | 6 | 유지 | 두벌식 겹받침/모음·문자 처리·짧은 시간 경계를 검사한다. ScoreManager는 이 계산의 연결을 검사한다. |
| `Viewport.test.ts` (삭제) | 77 | 4 | 삭제 후보 | 실제 CSS 대신 테스트 내부의 arenaAt/레이아웃 상수를 검증한다. 첫 2개도 포함 관계; check-input-mode의 실제 뷰포트 검사로 흡수한다. |
| [WhiteboardAnimation.test.ts](../tests/WhiteboardAnimation.test.ts) | 32 | 3 | 축소 | 단어 교체 위치 계산 2개 유지. WHITEBOARD_SCALE=0.9만 검사하는 1개는 제거 후보. |
| [WhiteboardReminder.test.ts](../tests/WhiteboardReminder.test.ts) | 96 | 4 | 유지 | 대상 없음·12초 경계·일시정지·소멸·스테이지 초기화를 검사한다. 단순 UI 문구 검사와 구별한다. |
| [WordDensity.test.ts](../tests/WordDensity.test.ts) | 78 | 9 | 축소 | 인원 증가·생성 속도·상한 유지. 정수 maxConcurrent의 <=MAX와 <MAX+1 중복을 합치고 '자리가 남는다' 제목을 수정. |
| [WordSpawner.test.ts](../tests/WordSpawner.test.ts) | 116 | 10 | 보완 | 중복/슬롯/상한의 240초 루프 3개를 한 관측 루프로 합친다. missed 페이드 테스트는 같은 id가 시간 후 사라지는지 직접 검사해야 한다. |
| [artSizes.test.ts](../tests/artSizes.test.ts) | 298 | 5 | 유지 | 전체 아트 크기 기록은 실제 재작화 회귀를 잡았던 검증이다. 크기 변경 감시와 위험 문턱 검사는 역할이 다르다. |
| [chase.test.ts](../tests/chase.test.ts) | 90 | 10 | 유지 | 상위 목록 제한·동점·최고 기록·순서 독립성은 서로 다른 순위 표시 계약이다. |
| [displaySettings.test.ts](../tests/displaySettings.test.ts) | 117 | 8 | 유지 | 저장소 오류·구형 설정·clamp·튜토리얼/조작 방식 이관 유지. 기본 shake=1 단언은 기본값 사례에 합칠 수 있다. |
| [elo.test.ts](../tests/elo.test.ts) | 99 | 9 | 유지 | 승패·실력 차이·동점·신규 참가자 보정의 수치 회귀를 보호한다. |
| [glow.test.ts](../tests/glow.test.ts) | 231 | 23 | 축소 | 색 변환·약함/강함·수명·최강 이벤트 선택 유지. 밝기 최소/최대를 한 계약으로 묶고 감쇠 곡선의 정확한 0.25 배수는 축소 후보. |
| [manualName.test.ts](../tests/manualName.test.ts) | 85 | 7 | 보완 | 이름 정제·저장·차단된 storage 유지. afterEach의 vi.unstubAllGlobals로 전역 mock 복원을 보장한다. |
| [matching.test.ts](../tests/matching.test.ts) | 117 | 13 | 보완 | 대기시간·양쪽 수용·오래 기다린 사람 우선은 유지. '자기 자신' 사례가 1명뿐이라 '혼자면 안 붙음'과 중복; 동일 device 2행으로 수정한다. |
| [materials.test.ts](../tests/materials.test.ts) | 147 | 9 | 축소 | 재질 참조·tone/grain 범위와 식별성 유지. (tone,grain) 유일성과 같은 tone의 grain 유일성은 같은 명제여서 하나로 합친다. |
| [musicFor.test.ts](../tests/musicFor.test.ts) | 55 | 7 | 유지 | 화면·낮밤·일시정지 음악 분기 7개는 작다. 표로 정리할 수 있으나 삭제 효과는 낮다. |
| [nicknames.test.ts](../tests/nicknames.test.ts) | 105 | 11 | 축소 | 길이/재료/검증 경계 유지. 실제 Math.random 200/50회는 주입된 고정값/seed로 대체; 무작위 반복으로 케이스 수를 늘리지 않는다. |
| [particle.test.ts](../tests/particle.test.ts) | 52 | 6 | 유지 | 조사 선택·공백·비한글 경계의 작은 순수 함수 테스트다. |
| [protocol.test.ts](../tests/protocol.test.ts) | 278 | 22 | 유지 | 비정상 네트워크 값·메시지별 필드·방 코드 검증을 유지. 타입 검사가 대신할 수 없는 외부 입력 계약이다. |
| [shapes.test.ts](../tests/shapes.test.ts) | 156 | 14 | 유지 | 폴리곤/compound·비율·실루엣·물리 크기 경계 유지. PhysicsWorld의 halfExtentY 예제를 이곳에 통합할 수 있다. |
| [tiers.test.ts](../tests/tiers.test.ts) | 27 | 3 | 유지 | 티어와 진행도 경계·음수 처리의 작은 검사다. |
| [titleTheme.test.ts](../tests/titleTheme.test.ts) | 12 | 7 | 유지 | 낮/밤 경계의 7개 표 기반 사례는 12줄이다. 파일 개수만 줄이려고 합칠 필요는 없다. |
| [tracks.test.ts](../tests/tracks.test.ts) | 151 | 16 | 축소 | 음표 범위·마디 길이·빈 곡 방지 유지. 모든 BPM이 다름/특정 악기 종류 수 등 작곡 제약은 기본 회귀에서 줄이거나 사운드 검수로 분리. |
| [voices.test.ts](../tests/voices.test.ts) | 73 | 3 | 유지 | 물리 무게 경계와 출력 증폭 보상의 실제 예약값 연결을 검사한다. AudioGate의 상수 검사를 이곳과 정리 가능. |
| [whiteboard-flow.measure.test.ts](../tests/measure/whiteboard-flow.measure.test.ts) | 75 | 측정 제외 | 분리 | 실험 측정으로 유지. MEASURE와 MEASURE_FLOW 이중 활성화 문서화; baseCommit 고정값 및 실제 설정 기록·실패 시 dispose를 보완. |
| [zz-balance.measure.test.ts](../tests/measure/zz-balance.measure.test.ts) | 141 | 측정 제외 | 분리 | 60판 모두 튜토리얼에서 멈춰 drop=0, 실행 실패 확인. 현재 시작 경로로 수리한 뒤 측정 전용으로 유지. |
| [zz-bounce.measure.test.ts](../tests/measure/zz-bounce.measure.test.ts) | 107 | 측정 제외 | 분리 | 3목숨/중앙 조준의 물리 실험이며 현재 싱글 판과 다르다. 재질 restitution 범위 같은 저렴한 무결성 검사는 materials로 이동 가능. |
| [zz-bowl.measure.test.ts](../tests/measure/zz-bowl.measure.test.ts) | 49 | 측정 제외 | 분리 | 18개×12seed의 물리 형상 비교 도구다. keptSum>0은 제품 성공 기준이 아니므로 측정 용도 유지. |
| [zz-contact.measure.test.ts](../tests/measure/zz-contact.measure.test.ts) | 231 | 측정 제외 | 분리 | 고유 레시피 수와 합성 횟수를 나눈 값은 성공률이 아니다. 같은 단위로 집계하고 실험 조건·결과 버전 기록 필요. |
| [zz-recipe-flow.measure.test.ts](../tests/measure/zz-recipe-flow.measure.test.ts) | 202 | 측정 제외 | 분리 | 1판/180초에서 입력 0·NaN 비율·실패 확인. 튜토리얼 시작 문제와 입력 성공 전 history 누적을 고친 뒤 측정 전용으로 유지. |



## 적용 기록 — 2026-09-13

테스트 파일은 116개·14,284줄에서 **106개·13,406줄**로 줄었다(테스트 파일 본문 기준 878줄 감소, helper 제외). 파일 이동분을 삭제량으로 세지 않았다. 이전 비측정 850개(기본 848개와 누락 TSX 2개)를 기준으로 정리 후 803개를 유지한다.

- 스타일·테스트 내부 수식만 고정하던 5파일을 삭제했다. ReadyRoom·TypingLane·CatcherPaint·ArenaBackdrop·Trails·tracks 등의 장식 단언과 확인된 중복을 축소했다.
- PhysicsSync→PhysicsKeyframe/PhysicsWorld, TurnCooldown·Standings→MatchState, MergeReveal→Merger, Ranked→MatchSession으로 고유 검사를 옮겼다. MatchId와 TurnLimit의 반복 실행도 합쳤다.
- 세션 시작 실패, 동일 AudioBus 재개, 특정 단어의 missed→제거, 방장 승계 뒤 새 id, 동일 기기의 중복 매칭 행, Trails의 빈 배열·dt 상한, 결과 버튼별 콜백을 보완했다.
- 강화한 MatchEngine 검사에서 시작 차례가 게스트일 때 방장 입력이 무시되던 준비 오류도 발견했다. 차례인 참가자가 입력하고 실제 dropped 메시지를 확인하도록 수정했다.
- WordSpawner 관측 루프와 ItemResolver 반복 호출을 축소하고, RNG 경계 및 고정 seed를 사용했다. LedgeGrowth는 고정 재료를 실제 엔진에서 합성하는 짧은 시나리오로 바꿨다.
- Canvas 5곳과 저장소·세션 준비 코드를 공유했다. Canvas fixture는 스타일 save/restore를 지원하지만 픽셀·변환 행렬·실제 글자 폭은 재현하지 않는다. 물리 World 및 수정한 엔진/측정 시나리오에 실패 시 정리를 추가했다.
- 서버 큐 만료 시간은 `worker/src/queuePolicy.ts`로 옮겨 실제 서버와 PollDelay 검사가 같은 값을 읽게 했다. 6초 값과 서버 동작은 유지했다.
- 측정·실험·보존 기능 폴더와 실행 명령을 분리했다. CI·push·변경 관련 pre-commit은 모든 비측정 그룹을 계속 검사한다. TSX도 발견한다.
- 두 측정 봇의 시작·회수·성공 입력 집계를 고쳤고, 보조 풀의 정의를 실제 RecipeFlow와 맞췄다. contact는 고유 종류끼리 비교하며 화이트보드 실험은 실제 소스 식별과 적용된 스테이지를 기록한다.

검토표의 축소 제안은 파일 전체 삭제 지시가 아니다. 공통 엔진의 shared 분기·구형 프로토콜 수용·생명/순위 API와 데이터 경계는 보존했다. 타이밍 자체를 관측하는 브라우저 대기 및 작곡/아트의 의도된 계약 일부도 남겼다. 전체 커버리지 또는 뮤테이션 점수의 동등성은 측정하지 않았다.

**적용 후 검증**

| 검사 | 결과 |
|---|---|
| `pnpm build` | 통과 |
| `pnpm test` | 94파일·772개 통과 |
| `pnpm test:all` | 100파일·803개 통과. 보존 4파일·25개와 실험 2파일·6개 포함 |
| balance·recipe-flow (`MEASURE_RUNS=2`) | 2파일·2개 통과. 실제 입력·합성 발생 및 보조 풀 노출 확인 |
| contact (`MEASURE_RUNS=2`)·bounce·bowl (고정 seed) | 3파일·5개 통과. 새 고유 종류 집계 확인 |
| whiteboard-flow (`MEASURE_RUNS=1`, 프로필 2종) | 1파일·1개 통과. 결과 JSON의 HEAD·sourceHash·실제 stage 1 목표 20 확인 |
| `pnpm test:browser` | 스크립트 5개 모두 통과. 입력 모드·메뉴·모바일 시작·결과 레이아웃/액션·PC/모바일 튜토리얼 |
| `pnpm lint` | 종료 코드 0. 수정하지 않은 `src/screens/lobby/modeRules.tsx`의 `only-export-components` 경고 2건 |
| `git diff --check`, 브라우저 runner 및 훅/push 쉘 구문 검사 | 통과 |

측정의 축소 실행 결과를 기본 60/10/40판의 통계나 제품 밸런스 승인으로 해석하지 않는다. 브라우저 검사는 데스크톱 Chromium의 뷰포트·입력 에뮬레이션 범위다.

## 최신 main 통합

PR 준비 기준 main은 `7674cea`다. 최초 검토 이후 추가된 3D·스토리·실험 코드를 유지하면서 3-way로 통합했다. 이 기준에서는 테스트 파일이 **132→122개, 15,222→14,343줄**로 줄었다(본문 879줄 감소, helper 제외). 기존 1,109개와 TSX 누락 2개를 합친 비측정 1,111개에서 47개를 정리해 전체 1,064개를 유지한다.

추가된 물리 요청·합성 경보 완화 실험도 experiments 그룹으로 옮겼다. 화이트보드 측정의 판별 FrameClock 재생성, `FLOW_SECONDS`, 스테이지별 측정, 추가 실험 변형을 유지하고 `stageSettings`와 `sourceHash`를 보완했다. Vitest의 일반 2워커·측정 1워커 제한과 문서 전용 pre-commit 경로도 유지했다.


최종 통합 기준은 `ecd473e`다. 추가된 합성 연출 동기화·기록 재시도 변경과 그 회귀 검사를 보존했다. 테스트 본문은 **133→123파일, 15,353→14,474줄**이며 전체 비측정 **117파일·1,070개**가 통과했다. 브라우저 모바일 시작 검사는 새 스토리 화면을 실제로 건너뛰고 입력 시작 버튼을 누르는 경로로 보완했다.

최종 기준의 빌드·린트와 전체 테스트 1,070개가 통과했다. 측정 6파일·8개를 축소 실행했고, 마지막 main 갱신의 영향을 받는 엔진 측정 3파일을 다시 통과했다. 브라우저 검사 5개가 통과했으며 마지막 갱신 후 결과 화면·PC/모바일 튜토리얼을 다시 확인했다. 이 통합 작업의 측정은 `MEASURE_RUNS=2`이며 화이트보드 흐름은 2프로필×2판이다. 장기 밸런스 통계와 전체 3D 시각 품질을 승인하는 검사는 아니다.
