export default {
  data() {
    return {
      id: '',
      project: { name: '', base_url: '' },
      scenarios: [],
      runs: [],
      env: {},
      selected: [],
      assignedCount: 0,
      starting: false,
      cancelling: '',
      err: '',
      loaded: false,
      uploadMsg: null,
      scenOpen: true,
      // 시나리오 선택 / 미리보기 팝업
      showPick: false,
      showPreview: false,
      previewPath: '',
      previewMd: '',
      previewLoading: false,
      previewErr: '',
      // AI 시나리오 모달
      showAi: false,
      messages: [],
      bubbles: [],
      draft: '',
      currentMd: '',
      sname: '',
      savedTag: '',
      sending: false,
      aiSaving: false,
      // 비밀번호 감지 보류 상태: 안내 후 같은 입력을 다시 보내면 마스킹 전송
      secretPending: false,
      secretPendingText: '',
    }
  },
  async mounted() {
    this.id = this.getParam('id')
    await this.load()
    try {
      const p = await this.$api.get('/api/projects/' + this.id + '/personas')
      this.assignedCount = (p.saved || []).length
    } catch (e) { /* noop */ }
  },
  computed: {
    previewHtml() { return window.marked ? window.marked.parse(this.previewMd || '') : this.previewMd },
    aiPreviewHtml() { return window.marked ? window.marked.parse(this.currentMd || '') : this.currentMd },
    serviceContext() {
      const p = this.project
      return p.name + (p.description ? ' — ' + p.description : '') + ' (' + p.base_url + ')'
    },
    // 실행 시작시각 오름차순 → 회차(1차·2차…) 매핑
    ordinalMap() {
      const sorted = [...this.runs].sort((a, b) => (a.started_at || 0) - (b.started_at || 0))
      const m = {}
      sorted.forEach((r, i) => { m[r.id] = i + 1 })
      return m
    },
  },
  methods: {
    refreshIcons() { this.$nextTick(() => window.qaIcons && window.qaIcons()) },
    recoClass(rc) { return window.qa.recoClass(rc) },
    statusLabel(s) { return window.qa.statusLabel(s) },
    isActive(s) { return window.qa.isActive(s) },
    fmtDateTime(ms) { return ms ? new Date(ms).toLocaleString('ko-KR') : '' },
    ordinal(r) { return this.ordinalMap[r.id] || 1 },
    openRun(r) { this.navigateTo('run-detail', { id: this.id, runId: r.id }) },
    async load() {
      try {
        const r = await this.$api.get('/api/projects/' + this.id + '/runs')
        this.project = r.project || this.project
        this.scenarios = r.scenarios || []
        this.runs = r.runs || []
        this.env = r.env || {}
        // 더 이상 존재하지 않는 시나리오는 선택 해제
        this.selected = this.selected.filter((s) => this.scenarios.includes(s))
      } catch (e) { /* noop */ }
      this.loaded = true
      this.refreshIcons()
    },
    toggle(s) {
      const i = this.selected.indexOf(s)
      if (i === -1) this.selected.push(s); else this.selected.splice(i, 1)
    },
    // ── 파일 등록 ──
    pickFile() { this.$refs.file && this.$refs.file.click() },
    async uploadFile(e) {
      const f = e.target.files && e.target.files[0]
      e.target.value = ''
      if (!f) return
      this.uploadMsg = { cls: 'muted', text: '등록 중…' }
      try {
        const markdown = await f.text()
        const name = f.name.replace(/\.(md|markdown)$/i, '')
        const { file } = await this.$api.post('/api/scenarios/save', { name, markdown, projectId: Number(this.id) })
        await this.load()
        if (file && !this.selected.includes(file)) this.selected.push(file)
        this.uploadMsg = { cls: 'text-mint', text: '✓ 등록됨: ' + file }
      } catch (err) { this.uploadMsg = { cls: 'text-red-600', text: '등록 실패: ' + err.message } }
    },
    // ── 미리보기 ──
    // 시나리오 파일 읽기 — 쿼리스트링 보존을 위해 raw fetch 사용($api 가 ?path= 를 변형하는 문제 회피)
    async loadScenario(p) {
      const r = await fetch('/api/scenarios/file?path=' + encodeURIComponent(p), { headers: { Accept: 'application/json' } })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.message || '불러올 수 없습니다')
      return data.markdown || ''
    },
    async openPreview(s) {
      this.previewPath = s
      this.previewMd = ''
      this.previewErr = ''
      this.previewLoading = true
      this.showPreview = true
      this.showPick = false
      this.refreshIcons()
      try {
        this.previewMd = await this.loadScenario(s)
      } catch (err) { this.previewErr = '불러오기 실패: ' + err.message }
      this.previewLoading = false
      this.refreshIcons()
    },
    // ── AI 시나리오 모달 ──
    async openAi(path) {
      this.showAi = true
      this.showPreview = false
      this.savedTag = ''
      this.bubbles = [{ cls: 'assistant', text: '안녕하세요. 어떤 서비스의 통합테스트 시나리오를 만들까요? 핵심 사용자 여정(예: 가입→탐색→결제→취소)이나 중점 평가 항목을 알려주시면 초안을 잡아드릴게요.' }]
      this.messages = []
      this.currentMd = ''
      this.sname = ''
      this.draft = ''
      this.secretPending = false
      this.secretPendingText = ''
      this.refreshIcons()
      if (path) {
        try {
          const markdown = await this.loadScenario(path)
          this.currentMd = markdown || ''
          this.sname = path.replace('scenarios/', '').replace(/\.md$/, '')
          this.messages = [{ role: 'assistant', content: '현재 시나리오 초안:\n```markdown\n' + markdown + '\n```' }]
          this.bubbles.push({ cls: 'assistant', text: '「' + path.replace('scenarios/', '') + '」를 불러왔습니다. 어떻게 수정할까요?' })
          this.scrollChat()
        } catch (err) { this.bubbles.push({ cls: 'assistant', text: '불러오기 실패: ' + err.message }) }
      }
    },
    closeAi() { if (this.sending || this.aiSaving) return; this.showAi = false; this.secretPending = false; this.secretPendingText = '' },
    scrollChat() { this.$nextTick(() => { const el = this.$refs.chat; if (el) el.scrollTop = el.scrollHeight }) },
    onKey(e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.send() } },
    // 비밀번호 감지: 라벨(password/비번 등) + 필수 구분자(:/=/：) + 자격증명 토큰 형태만 매칭(보수적).
    // 토큰은 공백/$/*/중괄호로 시작하지 않으므로 치환자 ${ENV:...}·마스킹(***)·라벨만 등장은 매칭되지 않는다(과탐 방지).
    // 구분자 없이 단어만 등장하는 경우(예: "password 정책")도 매칭하지 않는다. 원문 비번은 반환·로깅하지 않는다.
    secretRegex() {
      return /(?:password|passwd|pwd|pw|비밀번호|비번|암호)\s*[:=：]\s*([^\s$*{][^\s]*)/gi
    },
    detectSecret(text) {
      if (!text) return false
      return this.secretRegex().test(text)
    },
    // 감지된 비번 토큰을 치환자로 가린 텍스트 반환(원문 비번은 결과에 남기지 않음)
    maskSecret(text) {
      return text.replace(this.secretRegex(), (full, token) => full.slice(0, full.length - token.length) + '${ENV:QA_TEST_PASSWORD}')
    },
    async send() {
      const text = this.draft.trim()
      if (!text || this.sending) return
      // draft 가 바뀌면 보류 플래그 리셋(다른 입력에 보류 상태를 잘못 적용하지 않도록)
      if (this.secretPending && text !== this.secretPendingText) this.secretPending = false
      // 1차: 비번 감지 시 전송 보류 + 안내. 2차(같은 입력 재전송): 마스킹해서 전송.
      if (this.detectSecret(text)) {
        if (!this.secretPending) {
          this.secretPending = true
          this.secretPendingText = text
          this.bubbles.push({ cls: 'assistant', text: '비밀번호는 시나리오에 저장하지 않습니다. 계정 ID·로그인 경로만 적어 주시고, 비밀번호는 .env의 QA_TEST_PASSWORD(또는 config/target.json의 ${ENV:QA_TEST_PASSWORD})로 주입하세요.\n그래도 보내려면 다시 [보내기]를 누르면 비밀번호 부분은 가려서 전송합니다.' })
          this.scrollChat()
          return
        }
        // 2차 — 마스킹 후 진행
        this.draft = ''; this.sending = true
        this.secretPending = false; this.secretPendingText = ''
        const masked = this.maskSecret(text)
        this.bubbles.push({ cls: 'user', text: masked })
        this.messages.push({ role: 'user', content: masked })
        this.bubbles.push({ cls: 'assistant thinking', text: '생각 중…' })
        this.scrollChat()
        try {
          const out = await this.$api.post('/api/scenarios/chat', { messages: this.messages, serviceContext: this.serviceContext })
          this.bubbles.pop()
          this.bubbles.push({ cls: 'assistant', text: out.reply })
          this.messages.push({ role: 'assistant', content: out.reply })
          if (out.markdown) this.currentMd = out.markdown
        } catch (e) {
          this.bubbles.pop()
          this.bubbles.push({ cls: 'assistant', text: '오류: ' + e.message + ' (인증 확인 — claude login 또는 ANTHROPIC_API_KEY)' })
        }
        this.sending = false
        this.scrollChat()
        return
      }
      this.draft = ''; this.sending = true
      this.secretPending = false; this.secretPendingText = ''
      this.bubbles.push({ cls: 'user', text })
      this.messages.push({ role: 'user', content: text })
      this.bubbles.push({ cls: 'assistant thinking', text: '생각 중…' })
      this.scrollChat()
      try {
        const out = await this.$api.post('/api/scenarios/chat', { messages: this.messages, serviceContext: this.serviceContext })
        this.bubbles.pop()
        this.bubbles.push({ cls: 'assistant', text: out.reply })
        this.messages.push({ role: 'assistant', content: out.reply })
        if (out.markdown) this.currentMd = out.markdown
      } catch (e) {
        this.bubbles.pop()
        this.bubbles.push({ cls: 'assistant', text: '오류: ' + e.message + ' (인증 확인 — claude login 또는 ANTHROPIC_API_KEY)' })
      }
      this.sending = false
      this.scrollChat()
    },
    async saveAi() {
      if (!this.currentMd) { alert('저장할 시나리오 초안이 없습니다.'); return }
      if (!this.sname.trim()) { alert('파일명을 입력하세요.'); return }
      this.aiSaving = true
      try {
        const { file } = await this.$api.post('/api/scenarios/save', { name: this.sname.trim(), markdown: this.currentMd, projectId: Number(this.id) })
        this.savedTag = '· 저장됨: ' + file
        await this.load()
        if (file && !this.selected.includes(file)) this.selected.push(file)
      } catch (e) { alert('저장 실패: ' + e.message) }
      this.aiSaving = false
    },
    // ── 실행 ──
    async start() {
      if (!this.selected.length) return
      this.starting = true; this.err = ''
      const targets = [...this.selected]
      // 페르소나 탭에서 배정된 인원 전체로 실행(미배정이면 서버가 기본 5명으로 보정)
      const personaCount = Math.min(20, this.assignedCount || 0)
      let firstRunId = null
      try {
        for (const scenario of targets) {
          const { runId } = await this.$api.post('/api/runs', { projectId: Number(this.id), scenario, personaCount })
          if (!firstRunId) firstRunId = runId
        }
      } catch (e) {
        this.err = '실행 실패: ' + e.message; this.starting = false; return
      }
      if (targets.length === 1 && firstRunId) {
        this.navigateTo('run-detail', { id: this.id, runId: firstRunId })
        return
      }
      this.selected = []
      await this.load()
      this.starting = false
    },
    async cancelRun(r) {
      if (this.cancelling) return
      if (!confirm('이 QA 실행을 중단합니다.\n중단한 실행은 "없는 것"으로 처리되어 리포트·이슈가 모두 삭제되며 복구할 수 없습니다.\n계속할까요?')) return
      this.cancelling = r.id; this.err = ''
      try {
        await this.$api.delete('/api/runs/' + r.id)
        await this.load()
      } catch (e) { this.err = '중단 실패: ' + e.message }
      this.cancelling = ''
    },
    async rerun(r) {
      this.starting = true; this.err = ''
      // 추가된 페르소나까지 포함되도록 현재 배정 인원과 이전 회차 인원 중 큰 값(최대 20)
      const personaCount = Math.min(20, Math.max(Number(r.persona_count) || 5, this.assignedCount || 0))
      try {
        const { runId } = await this.$api.post('/api/runs', { projectId: Number(this.id), scenario: r.scenario, personaCount })
        this.navigateTo('run-detail', { id: this.id, runId })
      } catch (e) { this.err = '재실행 실패: ' + e.message; this.starting = false }
    },
  },
  watch: {
    scenOpen() { this.refreshIcons() },
  },
}
