# implementation/ — 구현 사이트 검증

> 유형 = **구현 사이트**. 검증 대상 = 실앱 구현·실연동(실 API + 실 Aurora + 샘플/실 데이터). 운영 정본 = [../README.md](../README.md).

- **프로파일**(정본 §2): 구현/실연동 라운드 — **blocker 0 강제(우회 불가)**.
- **주 검증축**: 화면 **9축 전체** + **실연동**(계약·에러·상태) + **데이터 5축** + 샘플데이터 E2E(조회·쓰기).
- **게이트**: **security·privacy 서명 필수**(qa 단독 GO 불가·AND 게이트) + **MOCK 배지 0** + 정적검증 증거. 판정 = [../README.md](../README.md) §5.
- **파일**: `<영역>-r<NN>.md` — 영역 6종(`fr01`·`ad01`·`api`·`br01`·`ba01`·`brandapi`).
- **결함ID**: `<영역>-r<NN>-D##`. blocker = [../_ledger.md](../_ledger.md)(등재·검산), 커버리지 = [../_coverage.md](../_coverage.md)(구현 열·MOCK 배지 0). 복수 라운드 `r01`부터.
