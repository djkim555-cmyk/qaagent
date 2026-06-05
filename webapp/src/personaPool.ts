import fs from 'node:fs'
import path from 'node:path'
import { PROJECT_ROOT } from './config.js'

// 기본 페르소나 시드 = QA 인력풀. 500인 파일 우선, 없으면 기존 20인 파일로 폴백.
const POOL_500 = path.join(PROJECT_ROOT, 'personas', 'persona-seed-500.json')
const POOL_20 = path.join(PROJECT_ROOT, 'personas', 'persona-seed.json')

function poolFile(): string {
  return fs.existsSync(POOL_500) ? POOL_500 : POOL_20
}

export function readPool(): { file: string; data: any; personas: any[] } {
  const file = poolFile()
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  return { file, data, personas: Array.isArray(data.personas) ? data.personas : [] }
}
export const poolSize = (): number => readPool().personas.length

/* ───────────── 분포 집계 (풀 갱신 시 재계산) ───────────── */
function summarize(personas: any[]) {
  const tally = (fn: (p: any) => string) =>
    personas.reduce((m: any, p) => { const k = fn(p); m[k] = (m[k] || 0) + 1; return m }, {})
  const acc = personas.reduce((m: any, p) => { for (const a of p.accessibility || []) m[a] = (m[a] || 0) + 1; return m }, {})
  return {
    ageBand: tally((p) => p.ageBand),
    gender: tally((p) => p.gender),
    region: tally((p) => p.region),
    digitalLiteracy: tally((p) => p.digitalLiteracy),
    primaryDevice: tally((p) => p.primaryDevice),
    accessibility: acc,
  }
}

/** 새 페르소나를 풀에 append하고 ID를 재발급해 반환(확정 ID 포함). */
export function appendToPool(newPersonas: any[]): any[] {
  if (!newPersonas.length) return []
  const { file, data, personas } = readPool()
  let maxNum = personas.reduce((m: number, p) => {
    const num = Number(String(p.id || '').replace(/\D/g, ''))
    return Number.isFinite(num) ? Math.max(m, num) : m
  }, 0)
  const added = newPersonas.map((p) => {
    maxNum += 1
    const { _new, _source, ...rest } = p
    return { ...rest, id: 'P' + String(maxNum).padStart(3, '0') }
  })
  data.personas = personas.concat(added)
  data.distributionSummary = summarize(data.personas)
  data.description = `한국 인구통계 기반 기본 QA 페르소나 ${data.personas.length}인 (QA 인력풀).`
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8')
  return added
}

/* ───────────── 타깃 고객층 → 풀에서 추출 ───────────── */
const STOP = new Set(['위주', '대상', '고객', '고객층', '사용자', '유저', '서비스', '이용', '주로', '및', '등', '기반', '중심', '타깃', '타겟'])
const SYN: Record<string, string[]> = {
  직장인: ['회사', '사무', '직장', '경리', '관리자', '영업', '공무원'],
  회사원: ['회사', '사무', '직장', '경리'],
  쇼핑: ['쇼핑', '구매', '결제', '가격', '쿠폰', '할인', '가성비'],
  결제: ['결제', '구매', '금액', '쿠폰'],
  학생: ['학생', '대학', '수험', '공시', '고등', '중학'],
  주부: ['주부', '워킹맘', '가정'],
  자영업: ['자영업', '소상공인', '상인', '식당', '카페', '미용'],
  소상공인: ['소상공인', '자영업', '상인', '식당', '미용'],
  사장: ['자영업', '소상공인', '식당', '카페'],
  개발자: ['개발', 'IT', '엔지니'],
  it: ['개발', 'IT', '엔지니'],
  디자이너: ['디자'],
  농업: ['농업', '농산'],
  은퇴: ['은퇴', '무직'],
  육아: ['워킹맘', '주부', '가정'],
}

function hash(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0) / 4294967296
}

function parseAges(text: string): string[] {
  const set = new Set<string>()
  const norm = (nn: number) => (nn >= 60 ? '60대+' : `${nn}대`)
  for (const m of text.matchAll(/(\d0)\s*[~\-–]\s*(\d0)\s*대/g)) {
    let a = +m[1], b = +m[2]; if (a > b) [a, b] = [b, a]
    for (let x = a; x <= b; x += 10) set.add(norm(x))
  }
  for (const m of text.matchAll(/(\d0)\s*대/g)) set.add(norm(+m[1]))
  if (/(청소년|십대|10대)/.test(text)) set.add('10대')
  if (/(어르신|고령|시니어|노년|노인)/.test(text)) { set.add('60대+'); set.add('50대') }
  return [...set]
}

interface Criteria {
  ages: string[]; device: string; litLow: boolean; litHigh: boolean; a11y: boolean; patterns: RegExp[]; raw: string
}
function parseAudience(audience: string): Criteria {
  const a = (audience || '').trim()
  const lower = a.toLowerCase()
  const device = /(pc|데스크|노트북)/i.test(a) ? 'PC' : /(모바일|스마트폰|앱|휴대폰)/.test(a) ? '모바일' : ''
  const litLow = /(어르신|고령|시니어|노인|초보|디지털 ?약|취약|입문)/.test(a)
  const litHigh = /(전문가|능숙|파워 ?유저|숙련|개발자|얼리)/.test(a)
  const a11y = /(노안|저시력|색약|시각|장애|접근성)/.test(a)
  // 키워드 → 패턴
  const pats: RegExp[] = []
  const seen = new Set<string>()
  const addPat = (p: string) => { const k = p.toLowerCase(); if (!seen.has(k)) { seen.add(k); pats.push(new RegExp(p, 'i')) } }
  for (const key of Object.keys(SYN)) if (lower.includes(key)) SYN[key].forEach(addPat)
  for (const tok of a.split(/[\s,·/、]+/)) {
    const t = tok.replace(/[^0-9a-zA-Z가-힣]/g, '')
    if (t.length >= 2 && !STOP.has(t) && !/^\d0대?$/.test(t)) addPat(t)
  }
  return { ages: parseAges(a), device, litLow, litHigh, a11y, patterns: pats, raw: a }
}

function satisfiesHard(p: any, c: Criteria): boolean {
  if (c.ages.length && !c.ages.includes(p.ageBand)) return false
  if (c.device && p.primaryDevice !== c.device && p.primaryDevice !== '둘다') return false
  if (c.litLow && p.digitalLiteracy !== '하') return false
  if (c.litHigh && p.digitalLiteracy !== '상') return false
  if (c.a11y && !(p.accessibility && p.accessibility.length)) return false
  return true
}

function score(p: any, c: Criteria): number {
  let s = 0
  if (c.ages.length && c.ages.includes(p.ageBand)) s += 3
  if (c.device && (p.primaryDevice === c.device || p.primaryDevice === '둘다')) s += 2
  if (c.litLow && p.digitalLiteracy === '하') s += 3
  if (c.litHigh && p.digitalLiteracy === '상') s += 3
  if (c.a11y && p.accessibility && p.accessibility.length) s += 3
  if (c.patterns.length) {
    const hay = [p.occupation, p.goals, p.personality, p.techBehavior, p.quote, (p.frustrationTriggers || []).join(' ')].join(' ')
    for (const re of c.patterns) if (re.test(hay)) s += 1
  }
  return s
}

/**
 * 타깃 고객층으로 풀에서 count명을 추출.
 * - hard 제약(연령/기기/친숙도/접근성)을 만족하는 인원이 qualified.
 * - 항상 count명을 채워 반환(부족분은 점수 높은 순). qualified < count 면 UI가 추가 생성을 권한다.
 */
export function selectFromPool(audience: string, count: number): { personas: any[]; qualified: number; total: number } {
  const { personas } = readPool()
  const c = parseAudience(audience)
  const hasCriteria = c.ages.length || c.device || c.litLow || c.litHigh || c.a11y || c.patterns.length
  const ranked = personas
    .map((p) => ({ p, hard: satisfiesHard(p, c), s: score(p, c), tie: hash(p.id) }))
    .sort((x, y) => {
      if (x.hard !== y.hard) return x.hard ? -1 : 1   // hard 제약 만족 우선
      if (y.s !== x.s) return y.s - x.s                // 점수 높은 순
      return x.tie - y.tie                             // 동점이면 다양성(결정론적)
    })
  const qualified = hasCriteria ? ranked.filter((r) => r.hard).length : personas.length
  return {
    personas: ranked.slice(0, count).map((r) => ({ ...r.p, _source: 'pool' })),
    qualified,
    total: personas.length,
  }
}
