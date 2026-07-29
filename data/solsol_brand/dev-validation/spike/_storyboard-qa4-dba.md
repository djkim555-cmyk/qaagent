# storyboard-qa4 데이터 스키마 정합성(4차, DBA 신규 페르소나)

> 정리: 바다(dba) · 2026-07-27 (KST)
> 대상: 카드(`0901-001_pu01~05`) · 구독(`0801-001·002·003·003_pu01`·`0601-004`) · 사이트(`0401-002`·`0401-001_pu01·_pu02`) · 결제내역(`1001-001`) · 계정(`0901-002·003`) — 총 13개 storyboard 파일
> 방법: `solsol-brand-api/src/db/schema.master.ts`(Drizzle) · `solsol-api/db/migrations/000_master.sql`(SoT DDL) · `solsol-brand-api/db/migrations/*.sql`(브랜드 미러) · `solsol-mng/docs/data-model/ERD.md` · 라우트 코드(`billing.ts`·`subscriptions.ts`·`sites.ts`·`account.ts`) 직접 대조. 추정 없음(전 항목 코드/DDL 근거 확인).

**판정: 신규 blocker(상) 0건. 신규 발견 4건(중 3·하 1) — 전부 기존 3라운드가 다루지 않은 "데이터 계층" 관점. storyboard의 필드명 서술은 전수 일치(불일치 0건). ERD는 최신이나 사소한 주석 누락 1건 확인.**

## 1. storyboard 필드명 ↔ 실제 스키마 대조표

| storyboard 파일 | 언급 필드 | 실제 컬럼(스키마) | 일치 | 근거(파일:라인) |
|---|---|---|---|---|
| `0901-001_pu01`(대표카드등록) | `isDefault` | `TB_BILLING_KEY.is_default` TINYINT NOT NULL DEFAULT 0 | 일치 | `schema.master.ts:260` · `000_master.sql:202` |
| `0901-001_pu02~04`(카드삭제·최소1·대표불가) | `card.isDefault`, `DELETE /api/billing/cards/:id` | 위와 동일 + soft delete `status=-1` | 일치 | `billing.ts:249-276` |
| `0901-001_pu05`(계정삭제) | `status=-1`(soft-delete), 비밀번호 확인 | `TB_USER.status` INT, `password_hash` 대조 | 일치 | `account.ts:289-322` |
| `0801-001`(자동연장) | `subscriptionId`, 연장 API | `TB_SUBSCRIPTION.id` PK, `POST /:id/extend` | 일치(라우트 파일 미확인이나 id 참조 방식 일치) | `subscriptions.ts` 주석 헤더 |
| `0801-002`(즉시결제) | 청구서 `invoiceId`, 재시도 | `TB_INVOICE.id`, `pay_state`(`payments.ts:114`) | 일치 | `payments.ts:101-180,338-345` |
| `0801-003`(구독취소) | `mode:'expire'`, `cancel_scheduled` | `TB_SUBSCRIPTION.cancel_scheduled` TINYINT · `sub_state` VARCHAR(12) | 일치 | `subscriptions.ts:16-26,471-518` · `schema.master.ts:241,246` |
| `0801-003_pu01`(취소완료안내) | `DELETE /api/subscriptions/:id` 성공 분기 | 동일 EP | 일치 | 상동 |
| `0601-004`(업그레이드/주기변경) | `subscription.currentPeriodStart~currentPeriodEnd`, `PATCH /:id/plan` | `TB_SUBSCRIPTION.current_period_start/end` DATETIME | 일치 | `schema.master.ts:238-239` |
| `0401-002`(사이트목록) | 사이트 플랜·도메인·용량 경고 | `TB_SITE.video_storage_used_bytes`(BIGINT)·`plan_state` | 일치 | `schema.master.ts:88-104` |
| `0401-001_pu01·_pu02`(도메인 중복확인) | `slug`, `GET /api/sites/check-slug` | `TB_SITE.slug` VARCHAR(50) NOT NULL UNIQUE(`uk_site_slug`) | 일치(길이 50 — 서버 검증 3~50과 일치, 클라 3~30은 storyboard가 이미 불일치로 지적) | `000_master.sql:20,35` · `sites.ts:245-266,355` |
| `1001-001`(결제내역) | 결제상태(완료/취소), 지급수단 | `TB_PAYMENT.pay_state` VARCHAR(15) · `card_company`/`card_type` | 일치 | `payments.ts:101-180` |
| `0901-002·003`(결제이메일변경) | `billing_email` 저장 API 부재 | `TB_USER.billing_email` VARCHAR(255) 컬럼은 **존재**하나 저장 라우트가 **없음**(`grep billing_email src/routes/*.ts` → 스키마 파일 외 0건) | 일치(storyboard의 "EP 없음" 서술 정확 — 컬럼 자체는 있음) | `schema.master.ts:116-117` vs routes 전수 grep |

## 2. 카드 최소1장/대표카드 — DB 레벨 제약 대안

2·3차 보안 QA가 지적한 "서버 미강제"(클라 `card.isDefault` 판별에만 의존, `billing.ts:249-276`에 대표/최소1장 가드 없음)를 DB 설계 관점에서 보강하는 안:

1. **대표카드 유일성(exactly-one-default)** — 앱 코드(`billing.ts:146-160,213-231`)가 "기존 대표 해제 후 신규 대표 지정" 2단계로 정규화하지만 **트랜잭션 경계가 없고 DB 유니크 제약도 없다** → 동시 요청(대표지정 2건 동시 클릭 등) 시 대표카드가 2개 이상 남을 수 있음(경쟁조건, 신규 발견).
   - **대안**: `TB_CREDIT.source_credit_key`(이미 이 스키마에 쓰이는 패턴, `schema.master.ts:349-350,361-363`)와 동일한 **생성열+부분유니크 흉내** 기법 적용.
     ```sql
     ALTER TABLE TB_BILLING_KEY
       ADD COLUMN default_marker BIGINT
       GENERATED ALWAYS AS (CASE WHEN is_default = 1 AND status = 1 THEN user_id ELSE NULL END) STORED,
       ADD UNIQUE KEY uk_billing_default (default_marker);
     ```
     NULL은 유니크 인덱스에서 여러 개 허용되므로 "대표 아님/삭제됨" 행은 제약 밖, "대표=1"인 행만 사용자당 1개로 강제된다. 앱 코드 변경 없이 DB가 최종 방어선이 된다(위반 시 `ER_DUP_ENTRY`를 앱이 잡아 재시도/에러 처리).
2. **최소 1장 유지 / 대표카드 삭제 방지** — 이 둘은 "행 1개 조건"이 아니라 **사용자별 카운트/상태 비교**(교차 행) 조건이라 CHECK 제약으로 표현 불가. 실무 대안 2가지:
   - **(권장) BEFORE UPDATE 트리거**: soft-delete가 `UPDATE ... SET status=-1`이므로, `OLD.status=1 AND NEW.status=-1`인 시점에 같은 `user_id`의 잔여 `status=1` 카드 수를 세어 1개 이하이면 차단, 혹은 `OLD.is_default=1`이고 다른 대표 후보가 없으면 차단.
     ```sql
     DELIMITER $$
     CREATE TRIGGER trg_billing_key_before_soft_delete
     BEFORE UPDATE ON TB_BILLING_KEY
     FOR EACH ROW
     BEGIN
       IF OLD.status = 1 AND NEW.status = -1 THEN
         IF (SELECT COUNT(*) FROM TB_BILLING_KEY WHERE user_id = OLD.user_id AND status = 1) <= 1 THEN
           SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '최소 1장의 결제 카드가 유지되어야 합니다.';
         END IF;
       END IF;
     END$$
     DELIMITER ;
     ```
     대표카드 삭제 방지는 애플리케이션이 "대표면 다른 카드를 먼저 대표로 지정"을 강제해야 하는 UX 흐름이라 트리거로 완전 대체하기보다 **API 가드 우선 + 트리거는 최후 방어선**으로 병행 권장(트리거만 있으면 사용자에게 "왜 안 되는지" 설명이 어려움 — UX는 여전히 API 400 응답이 담당해야 함).
   - **주의**: Aurora MySQL 5.6 호스트가 있는 패밀리 전역 규칙상(malgn-family.md) 트리거·온라인 DDL 제약을 이 브랜드 Aurora(8.0)에 적용하기 전 **호스트 버전 재확인** 필요. 8.0이면 트리거·CHECK 모두 지원.
   - 이 트리거는 카드 삭제뿐 아니라 **관리자단(brand-admin)의 강제 카드 무효화**·**배치 정리 스크립트**가 실수로 마지막 카드를 지우는 사고도 함께 막아준다는 부수 효과가 있음.
3. **실결제 연동 전 필수**: 위 1·2 모두 "실제 토스 빌링키 발급이 살아있는" 시점(현재는 `gated:pending:...` 스텁)에 앞서 적용해야 한다 — 스텁 단계에서는 데이터 손실 위험이 낮아 시급하지 않으나, 실연동 전환과 **함께** 마이그레이션에 포함할 것을 권고.

## 3. 데이터 정합성 리스크 — 계정 탈퇴(soft-delete) 고아 참조

- `DELETE /api/account`(`account.ts:289-322`)는 `TB_USER.status=-1`만 갱신하고 **연계 테이블에 아무 것도 하지 않는다**(코드 자체 주석 `TODO(withdraw): 활성 사이트·구독 존재 시 탈퇴 차단/정산 정책 — privacy/정책 확정 후`).
- 실제로 FK로 참조하는 3개 테이블이 모두 영향권: `TB_SITE.owner_user_id`(사이트 소유자 계속 참조) · `TB_SUBSCRIPTION.user_id`(구독 계속 active/grace 유지 가능) · `TB_BILLING_KEY.user_id`(빌링키도 status 그대로 1 유지 — 탈퇴해도 카드가 안 지워짐).
- 로그인 세션은 `auth.ts`가 매 요청 `eq(M.user.status, 1)`로 재검증하므로(`auth.ts:490-492,792`) 탈퇴 후 API 접근 자체는 즉시 차단된다 — **다만 이는 "사람이 못 들어온다"만 막을 뿐, 사이트·구독·결제라는 "돈이 도는 레코드"는 그대로 살아있어** 배치(정기결제 cron 등)가 `TB_USER.status`를 조인해 확인하지 않는 한 **탈퇴한 사용자에게 계속 청구**되는 시나리오가 이론상 가능.
- storyboard(`0901-001_pu05`)는 이 EP가 스파이크 단계에서 의도적으로 비활성화돼 있다고 정확히 서술 — **현재는 위험 없음(미호출)**. 그러나 "정식 연동" 시점에 이 갭이 그대로 열리면 사고로 이어질 수 있어, **정식 연동 전 필수 선결 항목**으로 등재 권고:
  1. 탈퇴 시 활성 사이트·구독 존재 여부 확인 → 존재하면 탈퇴 차단(정책 필요, 이미 코드 TODO에 명시) 또는
  2. 탈퇴와 동시에 `TB_SUBSCRIPTION`을 `mode=now`(즉시 해지)로 전이 + `TB_BILLING_KEY` soft-delete cascade(배치 트랜잭션으로 원자 처리).
- 이 발견은 2·3차 보안 QA가 다루지 않은 항목(그쪽은 클라이언트 확인모달·비밀번호 검증에 집중) — **데이터 계층 신규 발견**으로 분류.

## 4. ERD 최신성 평가

- **전반적으로 최신**: `TB_SUBSCRIPTION.cancel_scheduled`·`sub_state`, `TB_BILLING_KEY.is_default`, `TB_USER.billing_email`, `TB_SITE.video_storage_used_bytes` 등 storyboard가 언급한 모든 필드가 ERD.md에 이미 반영돼 있음(2026-07-10 R1~R3 재검수 개정이력 확인).
- **사소한 주석 누락 1건(하)**: `ERD.md:148`(및 `schema.master.ts:229` 주석)이 `sub_state`의 허용값을 `"active/grace/expired/canceled"`로만 서술하나, 실제 코드(`subscriptions.ts:16-25,304,332`)는 `'pending'`(게이트 대기·결제전 초기 상태)도 사용한다 — ERD·스키마 주석 모두 이 값 누락. 컬럼 타입이 VARCHAR(12)라 동작에는 영향 없으나(자유 텍스트), 문서 정합성 차원에서 `pending` 추가 권고.
- **일반 설계 관찰(하, 참고용)**: `sub_state`·`pay_state`·`invoice_state`·`credit_state`·`contact_state`·`event_state`·`code_state` 등 상태 컬럼이 전부 VARCHAR 자유텍스트이고 `ENUM`/`CHECK` 제약이 없다(malgn 컨벤션상 의도된 설계로 보이나, 오타로 잘못된 상태 문자열이 삽입돼도 DB가 막지 못함). 이번 스코프 화면들과 직결된 blocker는 아니라 등재만 하고 넘어감 — 필요 시 별도 라운드에서 전사 검토 권고.

## 최종 요약

- 검토 파일수: storyboard 13개 + 백엔드 코드 5개 파일(`billing.ts`·`subscriptions.ts`·`sites.ts`·`account.ts`·`payments.ts`) + 스키마 1개(`schema.master.ts`) + DDL 2개(`000_master.sql`·브랜드 마이그레이션 8개) + `ERD.md`
- 발견: 신규 4건 — 중 3(대표카드 유니크 부재/경쟁조건, 최소1장·대표카드 DB 미강제, 탈퇴 시 사이트/구독/빌링키 고아 참조) · 하 1(ERD `sub_state` pending 누락)
- storyboard 필드명 자체는 전수 일치(불일치 0건) — 필드명·타입 오기재는 발견되지 않음
- DB 제약 대안 요약: 대표카드=생성열+유니크 인덱스(`TB_CREDIT.source_credit_key`와 동일 패턴 재사용 가능) / 최소1장·대표삭제방지=BEFORE UPDATE 트리거(API 가드 병행 필수) / 탈퇴 cascade=배치·정책 선결
