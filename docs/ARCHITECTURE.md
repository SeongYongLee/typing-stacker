# 구조

```
src/
  game/
    core/         GameLoop(rAF 루프), GameEngine(조립 루트, 상태 소유)
    systems/      ── DOM·canvas·물리 의존성 0. 순수 TS ──
                  WordSpawner  좌우 레인 스폰/낙하/바닥선 판정
                  TypingJudge  입력 → 활성 단어 매칭
                  Aimer        화살표 위치 (삼각파, 등속)
                  ItemResolver 단어 → 물건 + 히든 롤
                  Merger       접촉 그래프에서 레시피 찾기
                  DayNight     흐른 시간 → 국면(첫 밤·낮·밤)과 어둠 정도
                  Opening      첫 밤에 내보낼 단어 고르기
                  NightWords   밤에 내보낼 단어 고르기 (재료만)
                  PairMarks    지금 서로 합칠 수 있는 것들에 표식 붙이기
                  Ledge        합성 보상으로 설 통나무 자리 고르기
                  Collection   도감 진행
                  ScoreManager 점수/콤보/타수 집계
                  TypingSpeed  한글 → 두벌식 키 수, 분당 타수 환산
                  Difficulty   탑 높이 → 단어 밀도
                  Camera       탑을 따라 올라가는 시야
                  LandingGlow  얹힌 물건의 색 (연출)
                  TrailField   흘리는 부스러기 (연출)
                  Rng          mulberry32 시드 난수
    physics/      PhysicsWorld(Rapier), collapseDetector(이탈 판정)
    renderer/     ArenaRenderer(Canvas 2D)
    data/         words.ts, recipes.ts, materials.ts, sprites.generated.ts(스크립트가 생성)
    shapes.ts     도형 크기 계산, 스프라이트 실루엣 → 충돌 도형
    config.ts     아레나 좌표계와 밸런스 상수
  audio/          WebAudio 절차 생성 — 사건을 소리로 바꾼다
  multi/          중계 전송로, 대전 엔진, 방 절차
  rank/           전역 순위 클라이언트
  storage/        도감·설정·프로필 (localStorage)
  components/     TypingLane, InputBar, Hud, StackArena, Vitals, …
  screens/        Title, Game, Result, Collection, Lobby, Match, Options
  hooks/          useGameEngine, useHangulInput, useAudio, …
scripts/
  prepare-sprites.cjs   스티커 → 크롭·축소·실루엣 분해 (빌드타임)
worker/           Cloudflare Worker + Durable Object (대전 중계, 순위)
tests/            순수 시스템 + 물리 + 엔진 단위 테스트
```

## React는 껍데기다

게임 상태는 `GameEngine`이 소유하고 프레임마다 스냅샷을 콜백으로 밀어주며, React는 그것만 그린다. 게임 루프를 React 렌더 주기에 묶지 않기 위한 것이다.

## 상태와 사건을 나눠 내보낸다

`onStateChange`는 "지금 어떤가"를, `onEvent`는 "무슨 일이 일어났는가"를 말한다. 소리는 뒤쪽이어야 한다 — 상태 스냅샷을 프레임마다 비교해 소리를 내려 하면 한 프레임에 두 번 일어난 일이 하나로 뭉개지고(무너질 때 부딪힘이 여럿이다), 값이 같은 자리로 되돌아온 것과 아무 일도 없던 것을 구분할 수 없다.

## 렌더링을 둘로 나눴다

낙하 단어·입력창·HUD는 DOM, 가운데 아레나만 Canvas다. 낙하 단어에는 물리가 필요 없고(y좌표만 감소), 한글 IME는 실제 `<input>` 엘리먼트가 반드시 있어야 한다. 물리가 필요한 곳은 아레나 안뿐이다.

## `game/systems/`와 `game/data/`는 의존성이 0이다

node 환경에서 캔버스 없이 테스트가 전부 돌아간다. 난수는 전부 `Rng`를 주입받아서 같은 시드면 단어 순서·히든 결과·통나무 자리가 재현된다. 시간도 루프가 주입하는 delta로만 흐른다. 이 셋은 서버가 같은 로직을 돌려 검증할 수 있게 하려는 경계다.

## 기술 선택은 근거를 요구해서 골랐다

npm 레지스트리에서 실제 릴리스 날짜와 주간 다운로드를 조회해 비교한 뒤 결정했다.

- **Phaser 4 대신 React + Rapier2D.** 이 게임이 그릴 것은 도형 몇십 개와 텍스트뿐이라 게임 엔진의 애셋 로더·씬 관리에서 얻을 게 없고, 한글 입력창은 어차피 DOM을 얹어야 한다.
- **matter-js 대신 Rapier2D.** ① 이 게임에서 무너짐이 곧 승패라 스태킹 안정성이 공정성 그 자체다 ② Rapier는 결정론적이어서 멀티에서 리플레이 검증과 분쟁 방지에 유리하다 ③ matter-js는 2년 넘게 릴리스가 없다.
  - 대가도 기록해둔다: Rapier는 예제가 훨씬 적고 수박게임류 클론 사례는 대부분 matter-js다. 실제로 이 빌드에 `convexDecomposition`이 없어서 오목 도형 분해를 직접 만들어야 했다.

---

좌표계·밟은 함정처럼 코드를 고칠 때 필요한 제약은 [`CLAUDE.md`](../CLAUDE.md)에 있다.
