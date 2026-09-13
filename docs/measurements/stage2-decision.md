# 2단계 목표 18개 — 보류

2026-09-13. 기준점 9f31d58. 유효 비교 48판(각 규칙 steady/slow 12판), 최대360초.

| 정책 | steady 2단계 완료 | slow 2단계 완료 | steady 합성/분 | slow 합성/분 |
| --- | --- | --- | --- | --- |
| 기존 28개 | 1/12 | 0/12 | 2.73 | 3.08 |
| 후보 18개 | 1/12 | 1/12 | 2.66 | 3.05 |

1단계 완료 후 2단계 진입은 두 규칙 모두 steady 9/12, slow 8/12.
후보의 평균 관측 생존 시간 비율은 100%, 101.1%. 단, 360초 생존은 우측 검열이다.
전체 합성/분 비율은 97.6%, 98.9%로 유지됐지만 완료 증가 기준(각 +3판)을 충족하지 못했다.
표본이 작고 완료 판이 거의 없어 완료한 사람만의 평균 시간은 채택 근거로 쓰지 않는다.

## 판단

숫자를 줄이는 것만으로 다음 성공을 자주 경험하게 했다는 근거가 부족하다.
운영 설정은 28개 유지. 후보는 테스트 전용이며 추가 holdout을 실행하지 않는다.
다음 우선순위는 실제 배치된 재료·결과물과 요청의 연결이다. 이 역시 회수량뿐 아니라 합성을 보존하는지 검증한다.

## 측정 수정

첫 비교 48판은 판 사이 가상 시계 누적 때문에 동일 seed의 1단계 결과가 달라져 폐기했다.
원본은 invalid-clock 파일로 보존했다. 매 판 새 FrameClock을 생성한 재측정 48판에서는
모든 seed의 1단계 완료 시간과 단계별 시간·회수·합성 수가 정확히 일치했다.
집계 스크립트는 이 불변 조건을 검사하며 다르면 결과 생성을 중단한다.
이번 실행 총 96판 중 채택 판단에 쓴 것은 재측정 48판뿐이다.
기존 실험 기록의 조건부 결론도 동일한 방법으로 재검증해야 하며 그 한계를 DECISION.md에 추가했다.

실행:
```
MEASURE=1 MEASURE_FLOW=1 FLOW_VARIANT=goal-10 FLOW_SECONDS=360 FLOW_OUTPUT=docs/measurements/stage2-control.json pnpm exec vitest run tests/measure/whiteboard-flow.measure.test.ts
MEASURE=1 MEASURE_FLOW=1 FLOW_VARIANT=stage2-18 FLOW_SECONDS=360 FLOW_OUTPUT=docs/measurements/stage2-18.json pnpm exec vitest run tests/measure/whiteboard-flow.measure.test.ts
node scripts/summarize-stage2.mjs docs/measurements/stage2-control.json docs/measurements/stage2-18.json docs/measurements/stage2-summary.json
```
