export default {
  data() {
    return {
      id: '',
      project: { name: '' },
      role: '',
      managers: [],
      form: { name: '', baseUrl: '', platform: 'web', description: '', guards: '', managerId: '' },
      saving: false,
      savedMsg: '',
      errors: { name: '', baseUrl: '' },
      // 담당자 관리
      developers: [],
      dName: '',
      dEmail: '',
      devSaving: false,
      devErr: '',
      // 삭제 이중 컨펌
      showDelete: false,
      delTarget: null,
      delStage: 1,
      delSaving: false,
      delErr: '',
    }
  },
  async mounted() {
    this.id = this.getParam('id')
    try {
      const r = await this.$api.get('/api/projects/' + this.id + '/settings')
      const p = r.project || {}
      this.project = p
      this.role = r.role || ''
      this.managers = r.managers || []
      this.form = {
        name: p.name || '', baseUrl: p.base_url || '', platform: p.platform || 'web',
        description: p.description || '', guards: p.guards || '',
        managerId: p.manager_id == null ? '' : p.manager_id,
      }
    } catch (e) { /* noop */ }
    await this.loadDevelopers()
  },
  methods: {
    refreshIcons() { this.$nextTick(() => window.qaIcons && window.qaIcons()) },
    // 대상 URL 형식 검사 — http(s):// 시작 + 호스트 존재. 통과 시 '' 반환.
    validateUrl(raw) {
      let u
      try { u = new URL(raw) } catch { return '유효한 URL을 입력해주세요. (예: https://example.com)' }
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'URL은 http:// 또는 https:// 로 시작해야 합니다.'
      const host = u.hostname
      if (!host || !(host.includes('.') || host === 'localhost' || host.startsWith('['))) return '유효한 URL을 입력해주세요. (예: https://example.com)'
      return ''
    },
    async save() {
      this.savedMsg = ''
      this.errors = { name: '', baseUrl: '' }
      // 필수 필드는 trim 후 빈값 차단 (공백만 입력 시 저장되던 문제 방지)
      const name = (this.form.name || '').trim()
      const baseUrl = (this.form.baseUrl || '').trim()
      if (!name) this.errors.name = '서비스명은 필수 항목입니다.'
      if (!baseUrl) this.errors.baseUrl = '대상 URL은 필수 항목입니다.'
      else this.errors.baseUrl = this.validateUrl(baseUrl)
      if (this.errors.name || this.errors.baseUrl) return
      // 정규화한 값으로 반영
      this.form.name = name
      this.form.baseUrl = baseUrl
      this.saving = true
      try {
        // managerId 는 최고관리자만 서버에서 반영됨 (관리자 역할이면 무시)
        await this.$api.post('/api/projects/' + this.id + '/settings', this.form)
        this.project.name = this.form.name
        this.savedMsg = '✓ 저장되었습니다.'
      } catch (e) { alert('저장 실패: ' + e.message) }
      this.saving = false
    },
    // ── 담당자 관리 ──
    async loadDevelopers() {
      try {
        const r = await this.$api.get('/api/projects/' + this.id + '/developers')
        this.developers = r.developers || []
      } catch (e) { /* noop */ }
      this.refreshIcons()
    },
    async addDev() {
      const name = (this.dName || '').trim()
      if (!name) { this.devErr = '이름을 입력하세요.'; return }
      this.devSaving = true; this.devErr = ''
      try {
        const r = await this.$api.post('/api/projects/' + this.id + '/developers', { name, email: this.dEmail })
        this.developers = r.developers || this.developers
        this.dName = ''; this.dEmail = ''
        this.refreshIcons()
      } catch (e) { this.devErr = e.message || '추가 실패' }
      this.devSaving = false
    },
    openDelete(d) {
      this.delTarget = d
      this.delStage = 1
      this.delErr = ''
      this.showDelete = true
      this.refreshIcons()
    },
    closeDelete() {
      if (this.delSaving) return
      this.showDelete = false
      this.delTarget = null
      this.delStage = 1
    },
    async confirmDelete() {
      if (!this.delTarget) return
      this.delSaving = true; this.delErr = ''
      try {
        await this.$api.delete('/api/projects/' + this.id + '/developers/' + this.delTarget.id)
        this.developers = this.developers.filter((x) => x.id !== this.delTarget.id)
        this.showDelete = false
        this.delTarget = null
        this.delStage = 1
      } catch (e) { this.delErr = e.message || '삭제 실패' }
      this.delSaving = false
    },
  },
  watch: {
    delStage() { this.refreshIcons() },
  },
}
