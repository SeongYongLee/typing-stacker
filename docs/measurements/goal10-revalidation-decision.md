# 목표10 재검증 — 조건부 유지

2026-09-13. 독립 FrameClock으로 새 대조48판을 실행하고 기존 독립 시계 후보48판을 재사용했다.
합성 경보 완화는 양쪽 모두0. 두 변경을 섞어 목표10의 효과로 해석하지 않는다.

| 관측 | 정책 | 첫 완료: 목표20→10 (각12판) | 합성/분 유지 | 관측 생존시간 유지 |
| --- | --- | --- | --- | --- |
| 최초 | steady | 2→9 | 80.3% | 99.8% |
| 최초 | slow | 2→7 | 94.2% | 101.1% |
| holdout | steady | 1→8 | 80.5% | 100% |
| holdout | slow | 0→9 | 87.8% | 100% |

기존 기준(각 완료+3판, 생존90%, 합성80%) 충족. 첫 회수 목표10 조건부 유지.
steady 합성 유지율이 경계에 가까워 실제 플레이에서 합성 기회가 충분한지 확인해야 한다.
전체 회수/분은 holdout steady93.9%, slow76.5%로 감소했다. 다음 단계 진입 후 흐름이 포함된다.
따라서 회수 정체 해결이나 전체 재미 개선의 확정 근거로 보지 않는다.

이 문서와 goal10-revalidation-summary.json이 이전 공유 시계 기반 목표10 수치의 후속 검증이다.
옛 원본은 삭제하지 않고 당시 결론의 한계와 재검증 경로를 DECISION.md에 표시한다.

재실행: MEASURE=1 MEASURE_FLOW=1 FLOW_VARIANT=baseline, 최초 offset0 / holdout104729.
후보 데이터: physical-control.json / physical-holdout-control.json (variant goal-10).
최대180초, 각 steady/slow12판. 새 측정 실행2개 모두 통과.
