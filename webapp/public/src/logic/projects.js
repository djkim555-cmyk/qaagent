export default {
  data() {
    return {
      projects: [],
      q: '',
      loaded: false,
      role: '',
      managers: [],
      showCreate: false,
      form: { name: '', baseUrl: '', platform: 'web', description: '', managerId: '' },
      saving: false,
      err: '',
      showHidden: false,
      selected: [],
      busyId: null,
    }
  },
  async mounted() {
    try {
      const e = await this.$api.get('/api/env'); this.role = e.role || ''
    } catch (e) { /* noop */ }
    if (this.role === 'super') {
      try { const m = await this.$api.get('/api/managers'); this.managers = m.managers || [] } catch (e) { /* noop */ }
    }
    try {
      const r = await this.$api.get('/api/projects')
      this.projects = r.projects || []
    } catch (e) { /* noop */ }
    this.loaded = true
    this.$nextTick(() => window.qaIcons && window.qaIcons())
  },
  watch: {
    q() { this.$nextTick(() => window.qaIcons && window.qaIcons()) },
    showHidden() { this.$nextTick(() => window.qaIcons && window.qaIcons()) },
  },
  computed: {
    visible() { return this.projects.filter((p) => !p.hidden) },
    hidden() { return this.projects.filter((p) => p.hidden) },
    filtered() {
      const s = this.q.trim().toLowerCase()
      if (!s) return this.visible
      return this.visible.filter((p) => {
        const hay = [p.name, p.base_url, p.platform, p.manager_name].filter(Boolean).join(' ').toLowerCase()
        return hay.includes(s)
      })
    },
    allHiddenChecked() { return this.hidden.length > 0 && this.selected.length === this.hidden.length },
  },
  methods: {
    fmtDate(ms) { return ms ? new Date(ms).toLocaleDateString('ko-KR') : '' },
    open(p) { this.navigateTo('project-overview', { id: p.id }) },
    async setHidden(p, hidden) {
      this.busyId = hidden ? p.id : 'bulk'
      try {
        await this.$api.patch('/api/projects/' + p.id + '/hidden', { hidden })
        p.hidden = hidden ? 1 : 0
      } catch (e) { alert(e.message || (hidden ? '숨기기 실패' : '숨기기 해제 실패')) }
      finally { this.busyId = null }
    },
    async hide(p) { await this.setHidden(p, true) },
    toggleHidden() {
      this.showHidden = !this.showHidden
      if (!this.showHidden) this.selected = []
    },
    toggleAll(e) {
      this.selected = e.target.checked ? this.hidden.map((p) => p.id) : []
    },
    async unhideSelected() {
      const targets = this.hidden.filter((p) => this.selected.includes(p.id))
      this.busyId = 'bulk'
      try {
        for (const p of targets) {
          await this.$api.patch('/api/projects/' + p.id + '/hidden', { hidden: false })
          p.hidden = 0
        }
        this.selected = []
        if (!this.hidden.length) this.showHidden = false
      } catch (e) { alert(e.message || '숨기기 해제 실패') }
      finally { this.busyId = null; this.$nextTick(() => window.qaIcons && window.qaIcons()) }
    },
    // 대상 URL 형식 검사 — http(s):// 시작 + 호스트 존재. 통과 시 '' 반환.
    validateUrl(raw) {
      let u
      try { u = new URL(raw) } catch { return '유효한 URL을 입력해주세요. (예: https://example.com)' }
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'URL은 http:// 또는 https:// 로 시작해야 합니다.'
      const host = u.hostname
      if (!host || !(host.includes('.') || host === 'localhost' || host.startsWith('['))) return '유효한 URL을 입력해주세요. (예: https://example.com)'
      return ''
    },
    openCreate() {
      this.form = { name: '', baseUrl: '', platform: 'web', description: '', managerId: '' }
      this.err = ''
      this.showCreate = true
      this.$nextTick(() => window.qaIcons && window.qaIcons())
    },
    closeCreate() {
      if (this.saving) return
      this.showCreate = false
    },
    async create() {
      const name = (this.form.name || '').trim()
      const baseUrl = (this.form.baseUrl || '').trim()
      if (!name) { this.err = '서비스명은 필수 항목입니다.'; return }
      if (!baseUrl) { this.err = '대상 URL은 필수 항목입니다.'; return }
      const urlErr = this.validateUrl(baseUrl)
      if (urlErr) { this.err = urlErr; return }
      this.form.name = name; this.form.baseUrl = baseUrl
      this.saving = true; this.err = ''
      try {
        const r = await this.$api.post('/api/projects', this.form)
        this.navigateTo('project-overview', { id: r.id })
      } catch (e) { this.err = e.message || '생성 실패'; this.saving = false }
    },
  },
}
