# 실제 재료 기반 요청 — 기본 적용 보류

2026-09-13. 기준점86a8ca0. 첫 비교48판 + 새 seed 재검증48판, 총96판.
게임판의 재료 수량을 만족한 레시피 결과를 한 요청에 연결했다. 공급 규칙은 유지했다.

| 관측 | steady 회수/분 비율 | slow 회수/분 비율 | steady 합성/분 비율 | slow 합성/분 비율 |
| --- | --- | --- | --- | --- |
| 최초 seed | 115.5% | 149.4% | 91.0% | 83.0% |
| holdout | 115.7% | 123.0% | 84.9% | 77.9% |

첫 스테이지 완료 수: 최초 steady9→9, slow7→11; holdout steady8→10, slow9→12 (각12판).
관측 생존 시간 비율은 모든 프로필에서100% 이상. 180초 관측 종료 판이 있어 실제 생존시간 평균은 아니다.
holdout slow의 합성/분 유지 기준80%에 미달했다. 따라서 기본 규칙에 적용하지 않는다.
임계값과의 차이가 작으므로 절대적으로 나쁜 아이디어라는 뜻은 아니다. 회수의 개선 신호는 있으나,
플레이어가 핵심인 합성을 덜 경험할 가능성을 해결하지 못했다.

## 해석과 다음 설계

재료가 모두 존재해도 서로 닿을지는 알 수 없고, 요청 결과물의 대체 히든이 나올 수도 있다.
봇이 회수 가능한 물건부터 입력하는 정책이라 재료 보존 전략을 평가하지 못한다.
따라서 인간의 재미·의도에 대한 증거로 보지 않는다.
다음 후보는 요청 강제 교체보다 합성 완성 후 추가 보상, 혹은 플레이어가 유지할 요청을 고르는 방식을 검토한다.
기본 회수 수치만 올리기 위해 합성 손실 기준을 완화하지 않는다.

## 검증

- 재료 중복 수량·요청 중복 방지·회수 가능한 요청 보존·공급 유지·30초 유지 테스트3개 통과.
- 타입 검사 통과. 측정 실행4개 통과.
- 원본 physical-control/request 및 physical-holdout-control/request JSON 보존.
- 집계: `node scripts/summarize-recall-candidate.mjs <control.json> <candidate.json> <output.json>`
- 측정: `MEASURE=1 MEASURE_FLOW=1 FLOW_VARIANT=goal-10` 또는 `physical-request`로 whiteboard-flow.measure.test.ts 실행.
- holdout은 `FLOW_SEED_OFFSET=104729`. 모든 판은 독립 FrameClock 사용.
