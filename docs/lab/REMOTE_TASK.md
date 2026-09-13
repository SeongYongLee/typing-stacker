이 저장소의 codex/gameplay-lab 브랜치에서 작업한다.
docs/lab/README.md, BACKLOG.md, CHANGELOG.md와 docs/measurements의 판단 기록을 먼저 읽는다.
pnpm install --frozen-lockfile로 준비한다.
미완료 작업을 하나씩 가설→구현→테스트→판단→커밋 순서로 진행한다.
기존 실험을 성공으로 포장하거나 재미를 자동 테스트만으로 입증했다고 쓰지 않는다.
작업 시간 내 가능한 항목을 진행하고, 끝날 때 CHANGELOG와 BACKLOG를 갱신해 다음 작업이 재개할 수 있게 한다.
원본 작업 폴더, main, 운영 순위 데이터는 변경하지 않는다. main 병합이나 배포는 하지 않는다.
실험이 실패하면 근거를 기록하고 후보 구현을 운영 코드에 남기지 않는다.
