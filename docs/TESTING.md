# 테스트 실행

| 명령 | 범위 |
|---|---|
| `pnpm test` / `pnpm test:watch` | 현재 제품 회귀 검사. 측정·실험·보존 기능 폴더 제외 |
| `pnpm test:all` | 측정 이외의 모든 TS/TSX 검사. CI·push 검사에서 사용 |
| `pnpm test:legacy` | 발판 배치/형성, 룰렛, 공유 모드 턴 제한 |
| `pnpm test:experiments` | 회수 공급·집중 요청·물리 요청·합성 경보 완화 실험 |
| `pnpm test:measure` | 물리·밸런스 측정. 화이트보드 흐름은 별도 활성화 필요 |
| `pnpm test:measure:flow` | 화이트보드 흐름 실험 |
| `pnpm test:browser` | 로컬 Vite 서버를 시작하고 브라우저 검사 5개를 실행한 뒤 종료 |

`test:all`은 브라우저나 측정까지 포함한다는 뜻이 아니다. pre-commit은 커밋될 트리에서 모든 비측정 그룹을 대상으로 변경 관련 검사를 실행한다.

`MatchEngine`, `MatchState`, 프로토콜 검사는 현재 모드와 공유 모드가 사용하는 공통 동작을 함께 다루므로 기본 실행에도 남아 있다. `legacy`는 모든 구형 코드의 완전한 목록이 아니라 별도로 실행할 수 있는 보존 기능 묶음이다.

## 측정

빠른 동작 확인:

```sh
MEASURE_RUNS=2 pnpm test:measure tests/measure/zz-balance.measure.test.ts tests/measure/zz-recipe-flow.measure.test.ts tests/measure/zz-contact.measure.test.ts
MEASURE_RUNS=1 FLOW_OUTPUT=/private/tmp/typing-stacker-flow.json pnpm test:measure:flow
```

`MEASURE_RUNS`는 balance·recipe-flow·contact·whiteboard-flow에 적용된다. 기본값은 각각 60·10·40·프로필당 12판이다. bounce·bowl은 고정 seed 집합을 사용한다. 적은 판 수의 통과는 측정 도구의 동작 확인이며 밸런스 검증은 아니다.

- balance/recipe-flow: 튜토리얼을 건너뛰고 회수 가능한 요청을 먼저 처리한다. recipe-flow의 입력 이력은 실제 `drop(source=input)` 이벤트가 발생한 제출만 센다.
- recipe-flow: 비레시피 물건 수는 관측값이다. 보조 풀 노출 계약은 `RecipeFlow.groupRecipes().ambient`로 검사하며 연쇄 합성 전용 재료도 포함한다.
- contact: 갖춘 고유 레시피 종류와 실제 합성한 고유 종류의 비율이다. 개별 접촉 시도 성공률이나 합성 횟수가 아니다.
- whiteboard-flow: `baseline`도 실험 helper가 stage 1 목표를 20으로 바꾼다. 결과의 `stageSettings`, `variant`, `baseCommit`, `sourceHash`를 함께 확인한다. `sourceHash`는 현재 제품·테스트·실행 설정·lockfile의 내용과 삭제를 반영한다.

## 브라우저

`playwright-core`가 사용할 Chromium이 필요하다. 설치된 브라우저가 기본 경로에 없으면 `PLAYWRIGHT_CHROMIUM_EXECUTABLE`에 실행 파일 경로를 지정한다. `pnpm test:browser mobile-start result-layout`처럼 검사 이름을 지정하면 선택한 스크립트만 실행한다. 이미 실행 중인 서버를 사용하려면 `BROWSER_BASE_URL`을 지정한다. 기본 포트는 `127.0.0.1:5176`이다.

브라우저 검사는 외부 요청을 차단한다. 결과 버튼은 각 클릭 전에 기록을 초기화하고 정확한 콜백 값을 확인한다. 메뉴 스크린샷은 `BROWSER_SCREENSHOT=/private/tmp/menu.png`를 지정한 진단 실행에서만 저장한다.

## 검사를 추가할 때

실패하면 어떤 제품 동작이 고장 났는지 설명할 수 있는 검사를 남긴다. CSS 수치·문구·테스트 내부 수식을 그대로 복사하는 검사는 줄인다. 동일 시뮬레이션에서 확인할 수 있는 상태는 함께 관측하고, 확률 분기는 주입 RNG 경계로 확인한다. 물리 World와 엔진은 단언 실패 때도 정리하며, 빈 배열의 `every`나 초기화 실패의 `return`으로 검사가 통과하지 않게 한다.
