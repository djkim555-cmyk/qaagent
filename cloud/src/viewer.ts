// QA 클라우드 뷰어 — 단일 페이지 앱(Vue 3 CDN + Tailwind). Worker 가 / 에서 서빙.
// 같은 오리진 /api/* 를 읽고(Access 쿠키 자동 동봉), 트리아지는 PATCH 로 클라우드에 기록(→ 로컬로 동기화).
// 사내 디자인 토큰: Primary #2B7FFF, Slate 중립, DM Sans + Pretendard, 카드는 ring.
export const VIEWER_HTML = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>QA 결과 뷰어</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />
<script src="https://cdn.tailwindcss.com?plugins=forms"></script>
<script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
<script>
tailwind.config = { theme: { extend: {
  colors: { primary: { 50:'#eff6ff',100:'#dbeafe',200:'#bfdbfe',300:'#93c5fd',400:'#60a5fa',500:'#2B7FFF',600:'#2563eb',700:'#1d4ed8' } },
  fontFamily: { sans: ['DM Sans','Pretendard','system-ui','sans-serif'] },
} } }
</script>
<style type="text/tailwindcss">
  body { letter-spacing: -0.01em; }
  .card { @apply bg-white rounded-md ring-1 ring-inset ring-slate-200; }
  .badge { @apply inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium tabular-nums; }
  .btn { @apply inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-medium px-3 h-9 transition; }
  .btn-primary { @apply btn bg-primary-500 text-white hover:bg-primary-600; }
  .btn-ghost { @apply btn ring-1 ring-inset ring-slate-300 text-slate-700 hover:bg-slate-50; }
  .lbl { @apply text-xs font-medium text-slate-500 mb-1; }
  .inp { @apply w-full rounded-md ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-primary-500 border-0 text-sm py-2; }
</style>
</head>
<body class="bg-slate-50 text-slate-800 text-sm">
<div id="app" class="max-w-6xl mx-auto px-6 py-6">

  <header class="flex items-center justify-between mb-6">
    <div class="flex items-center gap-2 min-w-0">
      <a href="#/" class="text-base font-bold tracking-tight text-slate-900 shrink-0">QA 결과 뷰어</a>
      <nav class="text-slate-400 text-sm truncate" v-if="crumbs.length">
        <span v-for="(c,i) in crumbs" :key="i">
          <span class="px-1">/</span><a :href="c.href" class="hover:text-primary-600">{{ c.label }}</a>
        </span>
      </nav>
    </div>
    <div class="flex items-center gap-3 shrink-0">
      <span v-if="savedMsg" class="text-xs" :class="savedErr ? 'text-red-600' : 'text-emerald-600'">{{ savedMsg }}</span>
      <button v-if="view==='run'" class="btn-primary h-8 px-3 text-sm" :disabled="savingAll || !dirtyCount" @click="saveAll">
        <span v-if="savingAll">저장 중…</span>
        <span v-else>저장하기<span v-if="dirtyCount"> ({{ dirtyCount }})</span></span>
      </button>
      <span class="badge bg-slate-100 text-slate-500">조회 + 트리아지 편집</span>
      <a href="/auth/logout" class="text-xs text-slate-400 hover:text-slate-600">로그아웃</a>
    </div>
  </header>

  <div v-if="loading" class="text-slate-400 py-20 text-center">불러오는 중…</div>
  <div v-else-if="error" class="card p-4 text-red-600">오류: {{ error }}</div>

  <!-- 프로젝트 목록 -->
  <section v-else-if="view==='home'">
    <h1 class="text-lg font-semibold tracking-tight mb-3">프로젝트</h1>
    <div v-if="!projects.length" class="text-slate-400">표시할 프로젝트가 없습니다.</div>
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      <a v-for="p in projects" :key="p.id" :href="'#/projects/'+p.id" class="card p-5 hover:ring-primary-300 block">
        <div class="font-semibold text-slate-900">{{ p.name }}</div>
        <div class="text-slate-500 text-xs mt-1 truncate">{{ p.base_url }}</div>
        <div class="text-slate-400 text-xs mt-3">{{ p.platform || '—' }}</div>
      </a>
    </div>
  </section>

  <!-- 프로젝트 상세: 실행 리스트 -->
  <section v-else-if="view==='project'">
    <h1 class="text-lg font-semibold tracking-tight mb-3">{{ projectName }} · 실행 리스트</h1>
    <div v-if="!runs.length" class="text-slate-400">실행 기록이 없습니다.</div>
    <div v-else class="card overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-slate-500 text-xs">
          <tr><th class="text-left font-medium px-4 py-2.5">시나리오</th><th class="text-left font-medium px-4 py-2.5">상태</th>
          <th class="text-left font-medium px-4 py-2.5">출시권고</th><th class="text-right font-medium px-4 py-2.5">P1</th>
          <th class="text-left font-medium px-4 py-2.5">실행일</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in runs" :key="r.id" class="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" @click="go('#/runs/'+r.id)">
            <td class="px-4 py-2.5 font-medium text-slate-800">{{ shortScenario(r.scenario) }}</td>
            <td class="px-4 py-2.5"><span class="badge" :class="runStatusCls(r.status)">{{ r.status }}</span></td>
            <td class="px-4 py-2.5 text-slate-600">{{ r.launch_recommendation || '—' }}</td>
            <td class="px-4 py-2.5 text-right tabular-nums">{{ r.p1_count ?? '—' }}</td>
            <td class="px-4 py-2.5 text-slate-500 tabular-nums">{{ fmt(r.started_at) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <!-- 실행 상세: 페르소나 + 이슈 -->
  <section v-else-if="view==='run'">
    <h1 class="text-lg font-semibold tracking-tight mb-1">{{ shortScenario(run.scenario) }}</h1>
    <div class="flex flex-wrap items-center gap-2 mb-4 text-xs text-slate-500">
      <span class="badge" :class="runStatusCls(run.status)">{{ run.status }}</span>
      <span v-if="run.launch_recommendation">출시권고: <b class="text-slate-700">{{ run.launch_recommendation }}</b></span>
      <span>· 페르소나 {{ personas.length }}명 · {{ fmt(run.started_at) }}</span>
    </div>
    <div v-if="run.summary" class="card p-4 mb-4 text-slate-700 whitespace-pre-line">{{ run.summary }}</div>

    <div class="flex items-center justify-between mb-2">
      <h2 class="text-sm font-semibold text-slate-700">이슈 ({{ issues.length }})</h2>
      <span class="text-xs text-slate-400">변경 즉시 저장 · 다음 동기화 때 로컬에도 반영</span>
    </div>
    <div class="card overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-slate-500 text-xs">
          <tr><th class="text-left font-medium px-4 py-2.5">제목</th><th class="text-left font-medium px-4 py-2.5">심각도</th>
          <th class="text-left font-medium px-4 py-2.5">구분</th><th class="text-left font-medium px-4 py-2.5">상태</th>
          <th class="text-left font-medium px-4 py-2.5">담당자</th><th class="text-left font-medium px-4 py-2.5">메모</th></tr>
        </thead>
        <tbody>
          <tr v-for="it in issues" :key="it.id" class="border-t border-slate-100 hover:bg-slate-50 align-middle">
            <td class="px-4 py-2.5 font-medium text-slate-800 max-w-sm">
              <button class="text-left hover:text-primary-600 truncate block w-full" @click="go('#/issues/'+it.id)" :title="it.title">{{ it.title }}</button>
            </td>
            <td class="px-4 py-2.5"><span class="badge" :class="sevCls(it.severity)">{{ it.severity || '—' }}</span></td>
            <td class="px-4 py-2.5">
              <select v-model="it.category" @change="markDirty(it)" class="rounded ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-primary-500 border-0 text-xs py-1 pl-2 pr-7 bg-white">
                <option v-if="!CATS.includes(it.category)" :value="it.category">{{ it.category || '미분류' }}</option>
                <option v-for="c in CATS" :key="c" :value="c">{{ c }}</option>
              </select>
            </td>
            <td class="px-4 py-2.5">
              <select v-model="it.status" @change="markDirty(it)" class="rounded ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-primary-500 border-0 text-xs py-1 pl-2 pr-7 bg-white">
                <option v-for="s in STS" :key="s" :value="s">{{ s }}</option>
              </select>
            </td>
            <td class="px-4 py-2.5">
              <select v-model="it.assignee_id" @change="markDirty(it)" class="rounded ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-primary-500 border-0 text-xs py-1 pl-2 pr-7 bg-white">
                <option :value="null">미지정</option>
                <option v-for="m in members" :key="m.id" :value="m.id">{{ m.name }}</option>
              </select>
            </td>
            <td class="px-4 py-2.5 whitespace-nowrap">
              <button class="btn-ghost h-7 px-2 text-xs" @click="openMemo(it)">메모<span v-if="it.memo" class="ml-1 text-primary-600">●</span></button>
              <span v-if="dirty[it.id]" class="ml-1 text-xs text-amber-600">변경됨</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <!-- 이슈 상세 + 트리아지 편집 -->
  <section v-else-if="view==='issue'" class="grid grid-cols-1 lg:grid-cols-3 gap-5">
    <div class="lg:col-span-2 card p-5">
      <div class="flex items-center gap-2 mb-2">
        <span class="badge" :class="sevCls(issue.severity)">{{ issue.severity || '—' }}</span>
        <span class="badge bg-slate-100 text-slate-600">{{ issue.type || '—' }}</span>
        <span class="text-xs text-slate-400">{{ issue.persona_name }}</span>
      </div>
      <h1 class="text-lg font-semibold tracking-tight mb-4">{{ issue.title }}</h1>
      <dl class="space-y-3">
        <div v-for="f in fields" :key="f.k" v-if="issue[f.k]">
          <div class="lbl">{{ f.label }}</div>
          <div class="text-slate-700 whitespace-pre-line">{{ issue[f.k] }}</div>
        </div>
      </dl>
    </div>

    <div class="card p-5 h-fit">
      <h2 class="text-sm font-semibold text-slate-700 mb-3">트리아지</h2>
      <div class="space-y-3">
        <div><div class="lbl">구분</div>
          <select v-model="form.category" class="inp"><option v-for="c in CATS" :key="c" :value="c">{{ c }}</option></select></div>
        <div><div class="lbl">상태</div>
          <select v-model="form.status" class="inp"><option v-for="s in STS" :key="s" :value="s">{{ s }}</option></select></div>
        <div><div class="lbl">담당자</div>
          <select v-model="form.assignee_id" class="inp"><option :value="null">미지정</option>
            <option v-for="m in members" :key="m.id" :value="m.id">{{ m.name }}</option></select></div>
        <div><div class="lbl">메모</div>
          <textarea v-model="form.memo" rows="4" class="inp" placeholder="트리아지 메모…"></textarea></div>
        <button class="btn-primary w-full" :disabled="saving" @click="saveTriage">{{ saving ? '저장 중…' : '저장' }}</button>
        <div v-if="saved" class="text-xs text-emerald-600">저장됨 · 다음 동기화 때 로컬에도 반영됩니다.</div>
        <div v-if="saveErr" class="text-xs text-red-600">{{ saveErr }}</div>
      </div>
    </div>
  </section>

  <!-- 메모 편집 모달 -->
  <div v-if="memo.open" class="fixed inset-0 bg-black/30 grid place-items-center z-50 px-4" @click.self="closeMemo">
    <div class="card p-5 w-[440px] max-w-full shadow-2xl">
      <div class="lbl mb-1">메모</div>
      <div class="text-xs text-slate-400 mb-2 truncate">{{ memo.target && memo.target.title }}</div>
      <textarea v-model="memo.draft" rows="5" class="inp" placeholder="트리아지 메모…"></textarea>
      <div class="flex justify-end gap-2 mt-3">
        <button class="btn-ghost" @click="closeMemo" :disabled="memo.saving">취소</button>
        <button class="btn-primary" @click="saveMemo" :disabled="memo.saving">{{ memo.saving ? '저장 중…' : '저장' }}</button>
      </div>
    </div>
  </div>
</div>

<script>
const { createApp } = Vue
createApp({
  data() { return {
    view:'home', loading:true, error:'', route:{},
    projects:[], runs:[], run:{}, personas:[], issues:[], issue:{}, members:[],
    projectsById:{},
    dirty:{}, savingAll:false, savedMsg:'', savedErr:false, reverting:false,
    memo:{ open:false, target:null, draft:'', saving:false },
    form:{ category:null, status:null, assignee_id:null, memo:'' }, saving:false, saved:false, saveErr:'',
    CATS:['문의','오류','기능개선','제안','성공'], STS:['열림','진행중','완료','보류'],
    fields:[ {k:'symptom',label:'현상'},{k:'repro',label:'재현 단계'},{k:'expected',label:'기대 동작'},
             {k:'actual',label:'실제 동작'},{k:'impact',label:'영향'},{k:'suggestion',label:'개선 제안'},
             {k:'evidence',label:'증거'},{k:'memo',label:'트리아지 메모'} ],
  } },
  computed: {
    dirtyCount() { return Object.keys(this.dirty).length },
    projectName() { const p = this.projectsById[this.route.id]; return p ? p.name : ('프로젝트 #'+this.route.id) },
    crumbs() {
      const c = []
      if (this.view==='project') c.push({label:this.projectName, href:'#/projects/'+this.route.id})
      if (this.view==='run') c.push({label:'실행', href:'#/runs/'+this.route.id})
      if (this.view==='issue') c.push({label:'이슈 #'+this.route.id, href:'#/issues/'+this.route.id})
      return c
    },
  },
  methods: {
    async api(path, opts) {
      const r = await fetch('/api'+path, Object.assign({ credentials:'include', headers:{'Content-Type':'application/json'} }, opts))
      if (r.status===401) { location.href = '/login'; throw new Error('로그인이 필요합니다.') }
      if (r.status===403) throw new Error('접근 권한이 없습니다.')
      if (!r.ok) throw new Error('HTTP '+r.status)
      return r.json()
    },
    go(h) { location.hash = h },
    fmt(ms) { if(!ms) return '—'; try { return new Date(Number(ms)).toLocaleString('ko-KR',{dateStyle:'medium',timeStyle:'short'}) } catch(e){ return '—' } },
    shortScenario(s) { if(!s) return '실행'; return String(s).replace(/^.*[\\\\/]/,'').replace(/\\.md$/,'') },
    sevCls(s){ return {'상':'bg-red-100 text-red-700','중':'bg-amber-100 text-amber-700','하':'bg-slate-100 text-slate-600'}[s] || 'bg-slate-100 text-slate-500' },
    stCls(s){ return {'열림':'bg-sky-100 text-sky-700','진행중':'bg-amber-100 text-amber-700','완료':'bg-emerald-100 text-emerald-700','보류':'bg-slate-100 text-slate-500'}[s] || 'bg-sky-100 text-sky-700' },
    runStatusCls(s){ return s==='done'||s==='완료' ? 'bg-emerald-100 text-emerald-700' : (s==='error'?'bg-red-100 text-red-700':'bg-slate-100 text-slate-600') },
    parseRoute() {
      const h = location.hash.replace(/^#/,'') || '/'
      const m = h.match(/^\\/(projects|runs|issues)\\/(.+)$/)
      if (m) return { view:{projects:'project',runs:'run',issues:'issue'}[m[1]], id:decodeURIComponent(m[2]) }
      return { view:'home', id:null }
    },
    async load() {
      this.loading = true; this.error = ''
      this.dirty = {}; this.savedMsg = ''   // 화면 전환 시 미저장 표시 초기화(데이터도 새로 로드됨)
      try {
        const r = this.parseRoute(); this.route = r; this.view = r.view
        if (!Object.keys(this.projectsById).length) {
          const d = await this.api('/projects'); this.projects = d.projects || []
          for (const p of this.projects) this.projectsById[p.id] = p
        }
        if (r.view==='project') { this.runs = (await this.api('/projects/'+r.id+'/runs')).runs || [] }
        else if (r.view==='run') {
          const d = await this.api('/runs/'+r.id); this.run = d.run||{}; this.personas = d.persona_runs||[]
          this.issues = (await this.api('/runs/'+r.id+'/issues')).issues || []
          await this.loadMembers(this.run.project_id)
        }
        else if (r.view==='issue') {
          this.issue = await this.api('/issues/'+r.id)
          await this.loadMembers(this.issue.project_id)
          this.form = { category:this.issue.category, status:this.issue.status||'열림', assignee_id:this.issue.assignee_id??null, memo:this.issue.memo||'' }
          this.saved=false; this.saveErr=''
        }
      } catch(e) { this.error = e.message } finally { this.loading = false }
    },
    async saveTriage() {
      this.saving=true; this.saved=false; this.saveErr=''
      try {
        const body = { category:this.form.category, status:this.form.status, assignee_id:this.form.assignee_id, memo:this.form.memo }
        const upd = await this.api('/issues/'+this.route.id+'/triage', { method:'PATCH', body:JSON.stringify(body) })
        this.issue = upd; this.saved = true
      } catch(e) { this.saveErr = e.message } finally { this.saving=false }
    },
    // 담당자 후보 = 이 프로젝트에 매칭된 회원
    async loadMembers(projectId) {
      if (projectId == null) { this.members = []; return }
      try { this.members = (await this.api('/projects/'+projectId+'/members')).members || [] } catch(e) { this.members = [] }
    },
    // 리스트 인라인 편집(구분/상태/담당자) — 변경 표시만, 저장은 우상단 '저장하기'로 일괄 반영
    markDirty(it) { this.dirty = Object.assign({}, this.dirty, { [it.id]: true }); this.savedMsg = '' },
    async saveAll() {
      const ids = Object.keys(this.dirty)
      if (!ids.length) return
      this.savingAll = true; this.savedMsg = ''
      try {
        for (const idStr of ids) {
          const it = this.issues.find((x) => String(x.id) === idStr)
          if (!it) continue
          await this.api('/issues/'+it.id+'/triage', { method:'PATCH', body: JSON.stringify({ category: it.category, status: it.status, assignee_id: it.assignee_id }) })
        }
        this.dirty = {}; this.savedErr = false; this.savedMsg = '✓ '+ids.length+'건 저장됨 · 다음 동기화 때 로컬 반영'
        setTimeout(() => { this.savedMsg = '' }, 4000)
      } catch(e) { this.savedErr = true; this.savedMsg = '저장 실패: ' + e.message }
      finally { this.savingAll = false }
    },
    openMemo(it) { this.memo = { open:true, target:it, draft: it.memo||'', saving:false } },
    closeMemo() { if (this.memo.saving) return; this.memo = { open:false, target:null, draft:'', saving:false } },
    async saveMemo() {
      if (!this.memo.target) return
      this.memo.saving = true
      try {
        await this.api('/issues/'+this.memo.target.id+'/triage', { method:'PATCH', body: JSON.stringify({ memo: this.memo.draft }) })
        this.memo.target.memo = this.memo.draft
        this.memo = { open:false, target:null, draft:'', saving:false }
      } catch(e) { alert('저장 실패: ' + e.message); this.memo.saving = false }
    },
  },
  mounted() {
    window.addEventListener('hashchange', () => {
      if (this.reverting) { this.reverting = false; return } // 프로그램적 원복 → 재확인 방지
      if (this.dirtyCount && !confirm('저장하지 않은 변경 '+this.dirtyCount+'건이 있습니다. 저장하지 않고 이동할까요?')) {
        // 이동 취소: 현재 경로로 해시 원복(아래 hashchange 1회는 reverting 플래그로 무시)
        const back = this.view==='run' ? '#/runs/'+this.route.id : (this.view==='project' ? '#/projects/'+this.route.id : (this.view==='issue' ? '#/issues/'+this.route.id : '#/'))
        if (location.hash !== back) { this.reverting = true; location.hash = back }
        return
      }
      this.load()
    })
    window.addEventListener('beforeunload', (e) => { if (this.dirtyCount) { e.preventDefault(); e.returnValue = '' } })
    this.load()
  },
}).mount('#app')
</script>
</body>
</html>`
