export default {
  data() {
    return {
      id: '',
      project: { name: '' },
      role: '',
      form: { name: '', baseUrl: '', platform: 'web', description: '', guards: '' },
      saving: false,
      savedMsg: '',
      errors: { name: '', baseUrl: '' },
      // 담당자(= 매칭된 회원) 관리 — 접속자 관리 › 프로젝트 매칭 › 회원매칭과 동일 방식
      allMembers: [],     // 승인된 전체 회원(선택 후보)
      memberSel: [],      // 현재 선택된 회원 id (추가 순서 유지)
      memberQuery: '',    // 회원 검색어
      memberSaving: false,
      memberMsg: '',
      memberErr: '',
    }
  },
  computed: {
    // id → 회원 객체
    memberById() { const m = {}; for (const x of this.allMembers) m[x.id] = x; return m },
    // 선택된 회원(추가 순서대로)
    selectedMembers() { return this.memberSel.map((id) => this.memberById[id]).filter(Boolean) },
    // 검색 결과 후보 — 아직 선택되지 않은 회원 중 검색어(이름/아이디/연락처) 일치분
    memberCandidates() {
      const q = this.memberQuery.trim().toLowerCase()
      const sel = new Set(this.memberSel)
      return this.allMembers.filter((m) => {
        if (sel.has(m.id)) return false
        if (!q) return true
        return [m.name, m.login_id, m.contact].filter(Boolean).join(' ').toLowerCase().includes(q)
      })
    },
  },
  async mounted() {
    this.id = this.getParam('id')
    try {
      const r = await this.$api.get('/api/projects/' + this.id + '/settings')
      const p = r.project || {}
      this.project = p
      this.role = r.role || ''
      this.form = {
        name: p.name || '', baseUrl: p.base_url || '', platform: p.platform || 'web',
        description: p.description || '', guards: p.guards || '',
      }
    } catch (e) { /* noop */ }
    await this.loadMembers()
  },
  methods: {
    refreshIcons() { this.$nextTick(() => window.qaIcons && window.qaIcons()) },
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
      const name = (this.form.name || '').trim()
      const baseUrl = (this.form.baseUrl || '').trim()
      if (!name) this.errors.name = '서비스명은 필수 항목입니다.'
      if (!baseUrl) this.errors.baseUrl = '대상 URL은 필수 항목입니다.'
      else this.errors.baseUrl = this.validateUrl(baseUrl)
      if (this.errors.name || this.errors.baseUrl) return
      this.form.name = name
      this.form.baseUrl = baseUrl
      this.saving = true
      try {
        await this.$api.post('/api/projects/' + this.id + '/settings', this.form)
        this.project.name = this.form.name
        this.savedMsg = '✓ 저장되었습니다.'
      } catch (e) { alert('저장 실패: ' + e.message) }
      this.saving = false
    },
    // ── 담당자(매칭 회원) 관리 ──
    async loadMembers() {
      try {
        const r = await this.$api.get('/api/projects/' + this.id + '/members')
        this.allMembers = r.allMembers || []
        this.memberSel = r.memberIds || []
      } catch (e) { /* noop */ }
      this.refreshIcons()
    },
    addMember(m) { if (!this.memberSel.includes(m.id)) this.memberSel.push(m.id); this.memberMsg = ''; this.refreshIcons() },
    removeMember(id) { this.memberSel = this.memberSel.filter((x) => x !== id); this.memberMsg = ''; this.refreshIcons() },
    // 검색 결과가 1명 이상이면 Enter 로 첫 후보 바로 추가
    addFirstMemberCandidate() { const c = this.memberCandidates; if (c.length) { this.addMember(c[0]); this.memberQuery = '' } },
    async saveMembers() {
      this.memberSaving = true; this.memberMsg = ''; this.memberErr = ''
      try {
        await this.$api.put('/api/projects/' + this.id + '/members', { memberIds: this.memberSel })
        this.memberMsg = '✓ 담당자가 저장되었습니다.'
      } catch (e) { this.memberErr = e.message || '저장 실패' }
      this.memberSaving = false
      this.refreshIcons()
    },
  },
}
