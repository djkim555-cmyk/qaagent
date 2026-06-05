// 500인 기본 페르소나 시드 생성기 (결정론적 — 재실행해도 동일 결과)
//
// demographic-model.md 의 한국 인구통계 분포(행안부 2025.6 / 통계청 2024)를 따른다.
//   node personas/generate-seed-500.mjs   →   personas/persona-seed-500.json
//
// 인구 비례(연령) + 목적표집 강조(고령·저친숙·접근성은 절대수 충분히 확보)를 함께 만족한다.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(HERE, 'persona-seed-500.json')
const TOTAL = 500

/* ── 재현 가능한 PRNG (mulberry32) ── */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry32(20260601)
const pick = (arr) => arr[Math.floor(rnd() * arr.length)]
const weighted = (pairs) => { // [[value, weight], ...]
  const sum = pairs.reduce((s, p) => s + p[1], 0)
  let r = rnd() * sum
  for (const [v, w] of pairs) { if ((r -= w) < 0) return v }
  return pairs[pairs.length - 1][0]
}

/* ── 연령대 배분 (행안부 2025.6, 10세 미만 제외 후 정규화 → 60·70대는 60대+로 통합) ── */
//  10대 9.95% · 20대 14.16% · 30대 14.16% · 40대 17.19% · 50대 17.95% · 60대+ 26.59%
const AGE_PLAN = [
  ['10대', 50, [13, 19]],
  ['20대', 71, [20, 29]],
  ['30대', 71, [30, 39]],
  ['40대', 86, [40, 49]],
  ['50대', 90, [50, 59]],
  ['60대+', 132, [60, 79]],
]

/* ── 이름 풀 ── */
const SURNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '전', '홍', '고', '문', '양', '손', '배', '백', '허', '유', '남', '심', '노', '하', '곽', '성', '차', '주', '우', '구', '민', '류']
// 세대별 흔한 이름(느슨한 경향 — 고령일수록 전통적 음절)
const MALE_YOUNG = ['도현', '서준', '하준', '지호', '예준', '주원', '시우', '건우', '우진', '준영', '민재', '현우', '지훈', '승현', '동현', '재윤', '시윤', '은우', '유준', '연우']
const MALE_MID = ['성준', '동철', '민호', '재훈', '상우', '진우', '태훈', '경석', '용준', '기현', '정훈', '병철', '광수', '수영', '종민', '대성', '영민', '재석', '현석', '인성']
const MALE_OLD = ['영식', '재근', '기철', '종수', '병호', '광열', '명환', '정수', '상복', '복동', '만수', '길수', '두식', '판석', '봉수', '석규', '용배', '학수', '갑수', '경호']
const FEMALE_YOUNG = ['서윤', '지아', '하윤', '서연', '지유', '하은', '예린', '수아', '지안', '유나', '채원', '다은', '시은', '소율', '연우', '예나', '윤서', '지원', '하린', '서아']
const FEMALE_MID = ['지영', '미경', '수진', '은정', '현주', '선영', '혜진', '정은', '미영', '경아', '소연', '유리', '진희', '명숙', '연희', '영주', '하늘', '주연', '보람', '세진']
const FEMALE_OLD = ['말순', '옥분', '영자', '순자', '정숙', '명자', '경자', '복순', '귀남', '금자', '춘자', '말자', '순옥', '필녀', '두례', '봉순', '점례', '간난', '분이', '영순']

/* ── 지역·도시 ── */
const CAPITAL_CITIES = ['서울', '서울', '서울', '인천', '경기 성남', '경기 수원', '경기 고양', '경기 용인', '경기 부천', '경기 안양', '경기 화성', '경기 남양주']
const PROVINCE_CITIES = ['부산', '대구', '광주', '대전', '울산', '전북 전주', '충북 청주', '경남 창원', '강원 원주', '경북 안동', '충남 천안', '전남 여수', '제주', '경북 포항', '경남 김해', '강원 춘천', '충남 아산']

/* ── 직업 (연령대별) ── */
const OCCUPATION = {
  '10대': ['고등학생', '고등학생', '중학생', '대학 신입생'],
  '20대': ['대학생', '취업준비생', '사회초년생 회사원', '대학원생', '카페 아르바이트', '프리랜서', '공시생'],
  '30대': ['회사원', 'IT 회사원', '워킹맘/사무직', '간호사(교대근무)', '자영업(카페)', '초등교사', '프리랜서 디자이너', '영업직'],
  '40대': ['회사 중간관리자', '전업주부', '소상공인', '학원 강사', '공무원', '보험설계사', '택배기사', '회사원'],
  '50대': ['자영업(식당)', '회사원(경리)', '주부', '소상공인(미용실)', '공장 생산직', '택시기사', '아파트 관리', '농업'],
  '60대+': ['은퇴자', '농업', '전업주부', '경비원', '소상공인', '청소 용역', '무직', '재래시장 상인'],
}

/* ── 행동 속성 템플릿 (디지털 친숙도별) ── */
const BEHAVIOR = {
  '상': [
    { goals: '원하는 걸 최소 클릭으로 빨리 끝내기. 군더더기 단계는 바로 이탈.', personality: '성격 급함, 인내심 낮음, 직관으로 빠르게 시도', techBehavior: '로딩 2초 넘으면 답답해함. 자동완성·소셜로그인 기대.', frustrationTriggers: ['느린 로딩', '긴 폼', '본인인증 강요'], quote: '이거 왜 이렇게 단계가 많아요? 그냥 바로 안 돼요?' },
    { goals: '조건 비교·꼼꼼한 확인 후 결정. 약관·환불 정책까지 읽음.', personality: '꼼꼼함, 의심 많음, 숨은 비용에 예민', techBehavior: '탭 여러 개 열어 비교. PC·모바일 오감. 오류 캡처 습관.', frustrationTriggers: ['숨은 수수료', '불명확한 약관', 'PC↔모바일 불일치'], quote: '최종 결제 금액이 처음 표시랑 다른데요?' },
    { goals: '업무 중 빠르게 처리. 효율·단축키·일관된 인터랙션 기대.', personality: '효율 중시, 일관성 없으면 짜증, 키보드 네비 선호', techBehavior: 'PC 위주, 탭/엔터로 폼 이동. 멀티태스킹.', frustrationTriggers: ['키보드 조작 불가', '비일관 버튼 위치', '불필요한 단계'], quote: '탭으로 다음 칸 넘어가야 하는데 포커스가 엉뚱한 데로 가요.' },
    { goals: '빠르게 핵심 기능만. 버그·엣지 케이스를 본능적으로 건드림.', personality: '탐색적, 비정상 입력 시도, 버그에 관대하지 않음', techBehavior: '개발자도구 열어봄. 새로고침·뒤로가기·중복클릭 테스트.', frustrationTriggers: ['콘솔 에러', '새로고침 시 상태 소실', '중복 제출 미방지'], quote: '뒤로가기 눌렀다 다시 오니까 입력한 게 다 날아갔어요.' },
    { goals: '최저가·할인·쿠폰 찾기. 가성비 최우선.', personality: '가격 민감, 프로모션 탐색적', techBehavior: '쿠폰코드·할인 배너부터 확인. 결제 직전 이탈 후 재방문.', frustrationTriggers: ['할인 적용 안 됨', '해지 어려움', '자동결제 함정'], quote: '쿠폰 넣었는데 할인이 안 들어가요. 어디서 적용하는 거예요?' },
    { goals: 'SNS 공유·후기 확인이 자연스러운지. 매끄러운 모바일 경험.', personality: '트렌드 민감, 디자인 안 예쁘면 신뢰 하락, 후기 의존', techBehavior: 'SNS 헤비유저. 다크모드 선호. 소셜로그인 기대.', frustrationTriggers: ['어색한 디자인', '소셜로그인 없음', '공유 버튼 부재'], quote: '후기가 안 보이는데... 이거 믿어도 되는 거 맞나?' },
  ],
  '중': [
    { goals: '짧은 자투리 시간에 한 손으로 빠르게. 방해받아도 이어서.', personality: '시간 없음, 산만한 환경, 빠른 이탈', techBehavior: '한 손 모바일. 앱 전환 잦음. 자동저장·이어하기 기대.', frustrationTriggers: ['세션 만료', '진행상황 미저장', '한 손 조작 어려움'], quote: '잠깐 다른 거 보다 왔더니 로그아웃돼서 처음부터 다시 해야 해요.' },
    { goals: '실제 도움이 되는지 확인 후 결제. 사기·과금에 경계심.', personality: '의심 많음, 신뢰 신호(후기·고객센터·환불) 중시', techBehavior: '결제 전 고객센터·환불정책 찾음. 전화 연결 확인.', frustrationTriggers: ['고객센터 없음', '환불 조건 모호', '확인 메일 없음'], quote: '문제 생기면 어디로 연락해요? 전화번호가 안 보이네요.' },
    { goals: '익숙한 방식대로 안전하게. 새 패턴보다 표준 UI 선호.', personality: '보수적, 변화 경계, 명시적 안내 선호', techBehavior: 'PC로 시작해 모바일로 확인. 모르는 용어/영어 UI에 막힘.', frustrationTriggers: ['영어 위주 UI', '비표준 인터랙션', '안내 부족'], quote: '이 버튼 누르면 어떻게 되는 건지 설명이 없어서 누르기가 무섭네요.' },
    { goals: '금액·숫자 정확성 중시. 신중하게 확인 후 진행.', personality: '신중, 숫자에 밝음, 확인 절차 선호', techBehavior: '금액 표시를 꼼꼼히 대조. 영수증·내역 확인. 의심되면 멈춤.', frustrationTriggers: ['금액 불일치', '내역 확인 불가', '확인 단계 없음'], quote: '합계가 항목 더한 거랑 안 맞는 것 같은데 다시 확인해야겠어요.' },
    { goals: '정보 정확성·꼼꼼한 입력. 표·목록을 자세히 확인.', personality: '꼼꼼함, 정확성 중시, 안내 문구 정독', techBehavior: '표·목록 정독. 인쇄·저장 기능 사용. 정렬·필터 기대.', frustrationTriggers: ['인쇄/저장 불가', '표 정렬 안 됨', '데이터 검증 부재'], quote: '목록을 날짜순으로 정렬하고 싶은데 그 기능이 없네요.' },
    { goals: '피곤한 상태에서도 헷갈리지 않게. 명확한 안내와 큰 버튼.', personality: '피로·집중력 저하, 실수 잦음, 되돌리기 필요', techBehavior: '졸린 채 사용. 오타·오클릭 잦음. 실행취소 기대.', frustrationTriggers: ['되돌리기 불가', '확인 없는 삭제', '작은 버튼 오터치'], quote: '실수로 눌렀는데 바로 삭제돼버렸어요. 취소가 안 되네요.' },
  ],
  '하': [
    { goals: '꼭 필요한 기능만 단순하게. 복잡하면 자녀·직원에게 부탁.', personality: '디지털 자신감 낮음, 천천히, 실수 두려움', techBehavior: '느리게 한 단계씩. 뒤로가기 못 찾음. 오류 뜨면 멈춤.', frustrationTriggers: ['전문용어', '여러 단계', '오류 후 회복 경로 없음'], quote: '여기서 다음에 뭘 눌러야 하는지 모르겠어요. 처음 화면으로 어떻게 가요?' },
    { goals: '빠르게 끝내고 싶은데 잘 안 보이고 헷갈림. 인내심 낮음.', personality: '급함 + 디지털 약함의 조합, 막히면 화남', techBehavior: '작은 글씨 잘 못 봄. 잘못 누르면 당황. 끝까지 못 가고 이탈.', frustrationTriggers: ['작은 글씨/버튼', '복잡한 절차', '에러 메시지 어려움'], quote: '뭐가 잘못됐다는데 무슨 말인지 하나도 모르겠고 짜증나요.' },
    { goals: '전화로 하던 걸 앱으로. 어려우면 바로 전화 상담 선호.', personality: '디지털 회피적, 도움 의존, 전화 선호', techBehavior: '앱 사용 자체가 낯섬. 버튼 못 찾음. 상담 연결 찾음.', frustrationTriggers: ['상담 연결 없음', '용어 어려움', '단계 많음'], quote: '그냥 전화로 하면 안 돼요? 이거 어떻게 하는 건지 모르겠어요.' },
    { goals: '천천히라도 스스로 끝내기. 큰 글씨·고대비 필요.', personality: '차분하지만 느림, 학습 의지 있음, 반복 확인', techBehavior: '글씨 키워서 봄. 화면 확대기 사용. 소리내어 한 단계씩.', frustrationTriggers: ['저대비 텍스트', '확대 미지원', '시간제한(타임아웃)'], quote: '천천히 읽고 있는데 시간이 지났다고 화면이 그냥 넘어가버렸어요.' },
    { goals: '자녀가 알려준 대로만. 새로운 화면 나오면 멈춤.', personality: '매우 느림, 새 화면 두려움, 정해진 길만 따라감', techBehavior: '느린 네트워크. 큰 버튼만 누름. 팝업·광고에 당황.', frustrationTriggers: ['느린 네트워크에서 깨짐', '예상 밖 화면 전환', '팝업'], quote: '갑자기 다른 창이 떠서 어떻게 닫는지 모르겠어요. 무서워서 다 껐어요.' },
    { goals: '자녀 도움 없이 간단한 조회/신청. 실패하면 포기하고 호출.', personality: '조심스러움, 실패 시 자책, 도움 의존', techBehavior: '느리게 진행. 영어·아이콘만 있는 버튼 이해 못 함.', frustrationTriggers: ['아이콘만 있는 버튼', '영어 라벨', '되돌릴 수 없는 경고'], quote: '이 그림(아이콘)이 무슨 뜻인지 몰라서 못 누르겠어요.' },
  ],
}

/* ── 친숙도 분포 (연령대별 가중) ── */
const LIT_BY_AGE = {
  '10대': [['상', 85], ['중', 15], ['하', 0]],
  '20대': [['상', 70], ['중', 27], ['하', 3]],
  '30대': [['상', 45], ['중', 45], ['하', 10]],
  '40대': [['상', 25], ['중', 50], ['하', 25]],
  '50대': [['상', 10], ['중', 45], ['하', 45]],
  '60대+': [['상', 3], ['중', 27], ['하', 70]],
}
const DEVICE_BY_LIT = {
  '상': [['모바일', 50], ['PC', 30], ['둘다', 20]],
  '중': [['모바일', 70], ['PC', 15], ['둘다', 15]],
  '하': [['모바일', 85], ['PC', 5], ['둘다', 10]],
}

function nameFor(gender, age) {
  const surname = pick(SURNAMES)
  const old = age >= 55, young = age <= 30
  let pool
  if (gender === '남') pool = old ? MALE_OLD : young ? MALE_YOUNG : MALE_MID
  else pool = old ? FEMALE_OLD : young ? FEMALE_YOUNG : FEMALE_MID
  return surname + pick(pool)
}

function accessibilityFor(age, gender) {
  const a = []
  // 색약: 주로 선천성 — 남성 약 4%, 연령 무관
  if (gender === '남' && rnd() < 0.045) a.push('색약')
  // 노안: 40대부터 증가
  const presbyopia = age >= 60 ? 0.85 : age >= 50 ? 0.6 : age >= 42 ? 0.3 : 0
  if (rnd() < presbyopia) a.push('노안')
  // 저시력: 고령에서 일부
  const lowVision = age >= 70 ? 0.18 : age >= 60 ? 0.1 : age >= 50 ? 0.04 : 0.01
  if (rnd() < lowVision) a.push('저시력')
  return a
}

/* ── 생성 ── */
const personas = []
let n = 0
for (const [ageBand, count, [lo, hi]] of AGE_PLAN) {
  for (let i = 0; i < count; i++) {
    n++
    const age = lo + Math.floor(rnd() * (hi - lo + 1))
    const gender = n % 2 === 0 ? '남' : '여' // 전체 균형 (≈250/250)
    const region = weighted([['수도권', 50.8], ['비수도권', 49.2]])
    const city = region === '수도권' ? pick(CAPITAL_CITIES) : pick(PROVINCE_CITIES)
    const occupation = pick(OCCUPATION[ageBand])
    const digitalLiteracy = weighted(LIT_BY_AGE[ageBand])
    const primaryDevice = weighted(DEVICE_BY_LIT[digitalLiteracy])
    const accessibility = accessibilityFor(age, gender)
    const b = pick(BEHAVIOR[digitalLiteracy])
    personas.push({
      id: 'P' + String(n).padStart(3, '0'),
      name: nameFor(gender, age),
      age, ageBand, gender, region, city, occupation,
      digitalLiteracy, primaryDevice, accessibility,
      goals: b.goals, personality: b.personality, techBehavior: b.techBehavior,
      frustrationTriggers: b.frustrationTriggers, quote: b.quote,
    })
  }
}

/* ── 분포 집계 ── */
const tally = (key, fn) => personas.reduce((m, p) => { const k = fn(p); m[k] = (m[k] || 0) + 1; return m }, {})
const accCount = personas.reduce((m, p) => { for (const a of p.accessibility) m[a] = (m[a] || 0) + 1; return m }, {})
const distributionSummary = {
  ageBand: tally('ageBand', (p) => p.ageBand),
  gender: tally('gender', (p) => p.gender),
  region: tally('region', (p) => p.region),
  digitalLiteracy: tally('digitalLiteracy', (p) => p.digitalLiteracy),
  primaryDevice: tally('primaryDevice', (p) => p.primaryDevice),
  accessibility: accCount,
}

const out = {
  $schema: './persona.schema.json',
  version: '1.0',
  description: `한국 인구통계 기반 기본 QA 페르소나 ${TOTAL}인. demographic-model.md의 분포를 따른다(결정론적 생성 — generate-seed-500.mjs).`,
  calibration: {
    source: '행정안전부 주민등록 인구통계 2025.6 (연령), 통계청 2024 인구주택총조사 (수도권 50.8%)',
    method: '인구 비례(연령) 배분 + 목적표집 강조(고령·저친숙·접근성 절대수 확보)',
    note: '연령은 10세 미만 제외 후 정규화하여 비례 배분. 60·70대는 60대+로 통합. 친숙도·기기·접근성은 연령에 상관해 가중 표본.',
  },
  distributionSummary,
  personas,
}

fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8')
console.log(`✓ ${personas.length}인 생성 → ${path.relative(process.cwd(), OUT)}`)
console.log(JSON.stringify(distributionSummary, null, 2))
