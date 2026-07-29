# schema/ — DB 스키마 검증

> 유형 = **DB 스키마**. 검증 대상 = 스키마·마이그레이션·ERD·시드(Aurora master/tenant). 운영 정본 = [../README.md](../README.md).

- **프로파일**(정본 §2): 데이터/계약 라운드.
- **주 검증축**: **데이터 5축**(①스키마 정합 4자 `sql↔ORM↔ERD↔계약` ②마이그 안전 ③시드 정합 ④정합성 UNIQUE·멱등키 ⑤성능) — [../README.md](../README.md) §6-데이터.
- **재검증 트리거**: `*.sql`·`ERD.md`·`schema*.ts` 변경 시 N+1 필수 + 스냅샷(테이블 수+커밋) IDENTICAL.
- **파일**: `<영역>-r<NN>.md` — 스키마 소유 백엔드 영역: `api-*`(쏠쏠 tenant `solsol_lms`) · `brandapi-*`(브랜드 master `solsol`). ERD 통합은 허브.
- **결함ID**: `<영역>-r<NN>-D##` + 원인 태그 `[DDL위반]`/`[ERD드리프트]`/`[06참고오류]`. 커버리지는 [../_coverage.md](../_coverage.md) 스키마 표(테이블 단위).
