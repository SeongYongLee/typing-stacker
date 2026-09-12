# 게임성 1차 실험

기준 버전: `b3aaccb`. 자동 실험은 테스트 전용 코드로 수행하며, 실제 플레이어의 재미·이해도 조사를 대신하지 않는다.

- [사전 기준과 실험 조건](flow-protocol.md)
- [집계 표](flow-summary.md)
- `flow-*.json`: 각 판의 원자료. `seconds`는 최대 180초 부근에서 관찰을 종료한 시간이며, `censored: true`는 게임오버 전 관찰 종료를 뜻한다. 무제한 생존 시간이나 실제 인간의 평균 판 길이가 아니다.
- `blockedFraction`: 플레이 중 회수 가능한 화이트보드 목표가 하나도 없는 시간 비율이다. 플레이어가 아무것도 못 하거나 멈춰 있는 시간과는 다르다.
- `firstRecall` / `firstClear`: 없으면 null. 성공한 판만의 중앙값을 전체 플레이어의 완료 시간처럼 해석하면 안 된다.
- 두 버전이 다른 시점에 다음 단계에 진입하므로 180초 전체의 회수·합성 변화에는 스테이지 구성 변화도 포함된다. 재료를 회수해서 합성이 줄었다는 특정 인과는 아직 분리 검증하지 않았다.

## 재현

```sh
MEASURE=1 MEASURE_FLOW=1 FLOW_VARIANT=baseline FLOW_LABEL=baseline FLOW_OUTPUT=docs/measurements/flow-baseline.json pnpm exec vitest run tests/whiteboard-flow.measure.test.ts
```

`FLOW_VARIANT`는 `baseline`, `request-supply`, `targets-only`, `supply-only`, `goal-10`, `alarm-5`를 지원한다. `FLOW_PROFILE=pressure`는 느려서 단어 만료가 일어나는 정책을 사용한다. `FLOW_SEED_OFFSET=104729`는 탐색에 사용하지 않은 검증 시드 묶음이다. label과 output은 결과가 덮이지 않도록 바꾼다.

모든 결과 파일이 있으면 `node scripts/summarize-flow.mjs`로 표를 재생성한다. 측정 테스트는 일반 `pnpm test`에서 제외되며 별도 실행한다. 외부 분석 서비스나 순위 서버로 기록을 보내지 않는다.
