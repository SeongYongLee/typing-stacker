/** 컴프레서가 피크를 정리한 뒤 실제 스피커로 나가기 직전의 전체 배율 */
const FINAL_OUTPUT_GAIN = 1.3

/** 전체 출력이 커져도 히든 발견 종소리는 지금 음량을 유지한다 */
const HIDDEN_REVEAL_PRE_GAIN = 1 / FINAL_OUTPUT_GAIN

export { FINAL_OUTPUT_GAIN, HIDDEN_REVEAL_PRE_GAIN }
