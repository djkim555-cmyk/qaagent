export default {
  data() {
    return {
      tab: 'members',          // 'members' | 'matching'
      members: [],
      projects: [],
      loaded: false,
      // 이름 변경 모달
      showName: false,
      nameTarget: null,
      nameDraft: '',
      nameSaving: false,
      nameErr: '',
      // 탈퇴(삭제) 이중 컨펌
      showDelete: false,
      delTarget: null,
      delStage: 1,
      delSaving: false,
      delErr: '',
      // 프로젝트 매칭 모달
      showMatch: false,
      matchProject: null,
      matchSel: [],          // 선택된 회원 id (추가 순서 유지)
      matchQuery: '',        // 회원 검색어
      matchSaving: false,
      matchErr: '',
    }
  },
  async mounted() { await this.load() },
  computed: {
    approvedMembers() { return this.members.filter((m) => m.status === 'approved') },
    pendingCount() { return this.members.filter((m) => m.status === 'pending').length },
    // id → 회원 객체
    memberById() { const m = {}; for (const x of this.approvedMembers) m[x.id] = x; return m },
    // 선택된 회원(추가 순서대로)
    selectedMembers() { return this.matchSel.map((id) => this.memberById[id]).filter(Boolean) },
    // 검색 결과 후보 — 아직 선택되지 않은 승인 회원 중 검색어(이름/아이디/연락처) 일치분
    matchCandidates() {
      const q = this.matchQuery.trim().toLowerCase()
      const sel = new Set(this.matchSel)
      return this.approvedMembers.filter((m) => {
        if (sel.has(m.id)) return false
        if (!q) return true
        return [m.name, m.login_id, m.contact].filter(Boolean).join(' ').toLowerCase().includes(q)
      })
    },
  },
  methods: {
    refreshIcons() { this.$nextTick(() => window.qaIcons && window.qaIcons()) },
    setTab(t) { this.tab = t; this.refreshIcons() },
    async load() {
      try {
        const r = await this.$api.get('/api/managers')
        this.members = r.managers || []
      } catch (e) {
        // 슈퍼관리자가 아니면 403 → 프로젝트로 돌려보냄
        this.navigateTo('projects')
        this.loaded = true
        return
      }
      try {
        const p = await this.$api.get('/api/projects')
        this.projects = p.projects || []
      } catch (e) { /* noop */ }
      this.loaded = true
      this.refreshIcons()
    },
    statusLabel(s) { return s === 'approved' ? '승인됨' : '승인 대기' },
    // ── 승인 ──
    async approve(m) {
      try {
        await this.$api.post('/api/managers/' + m.id + '/approve', {})
        m.status = 'approved'
      } catch (e) { alert(e.message || '승인 실패') }
    },
    // ── 이름 변경 ──
    openName(m) {
      this.nameTarget = m
      this.nameDraft = m.name || ''
      this.nameErr = ''
      this.showName = true
      this.refreshIcons()
    },
    closeName() { if (this.nameSaving) return; this.showName = false; this.nameTarget = null },
    async saveName() {
      if (!this.nameTarget) return
      const name = (this.nameDraft || '').trim()
      if (!name) { this.nameErr = '이름을 입력하세요.'; return }
      this.nameSaving = true; this.nameErr = ''
      try {
        await this.$api.patch('/api/managers/' + this.nameTarget.id, { name })
        this.nameTarget.name = name
        this.showName = false
        this.nameTarget = null
      } catch (e) { this.nameErr = e.message || '변경 실패' }
      this.nameSaving = false
    },
    async resetPw(m) {
      const pw = prompt(`'${m.name}' 의 새 비밀번호 (4자 이상)`)
      if (pw == null) return
      if (pw.length < 4) { alert('비밀번호는 4자 이상이어야 합니다.'); return }
      try {
        await this.$api.patch('/api/managers/' + m.id, { password: pw })
        alert('비밀번호가 변경되었습니다.')
      } catch (e) { alert(e.message || '변경 실패') }
    },
    // ── 탈퇴(삭제) 이중 컨펌 ──
    openDelete(m) {
      this.delTarget = m; this.delStage = 1; this.delErr = ''; this.showDelete = true
      this.refreshIcons()
    },
    closeDelete() { if (this.delSaving) return; this.showDelete = false; this.delTarget = null; this.delStage = 1 },
    async confirmDelete() {
      if (!this.delTarget) return
      this.delSaving = true; this.delErr = ''
      try {
        await this.$api.delete('/api/managers/' + this.delTarget.id)
        this.members = this.members.filter((x) => x.id !== this.delTarget.id)
        this.showDelete = false; this.delTarget = null; this.delStage = 1
        await this.load()
      } catch (e) { this.delErr = e.message || '탈퇴 처리 실패' }
      this.delSaving = false
    },
    // ── 프로젝트 매칭 ──
    async openMatch(p) {
      this.matchProject = p
      this.matchErr = ''
      this.matchSel = []
      this.matchQuery = ''
      this.showMatch = true
      this.refreshIcons()
      try {
        const r = await this.$api.get('/api/projects/' + p.id + '/members')
        this.matchSel = r.memberIds || []
      } catch (e) { this.matchErr = e.message || '불러오기 실패' }
      this.refreshIcons()
    },
    addMatch(m) { if (!this.matchSel.includes(m.id)) this.matchSel.push(m.id); this.refreshIcons() },
    removeMatch(id) { this.matchSel = this.matchSel.filter((x) => x !== id); this.refreshIcons() },
    // 검색 결과가 1명이면 Enter 로 바로 추가
    addFirstCandidate() { const c = this.matchCandidates; if (c.length) { this.addMatch(c[0]); this.matchQuery = '' } },
    closeMatch() { if (this.matchSaving) return; this.showMatch = false; this.matchProject = null },
    async saveMatch() {
      if (!this.matchProject) return
      this.matchSaving = true; this.matchErr = ''
      try {
        await this.$api.put('/api/projects/' + this.matchProject.id + '/members', { memberIds: this.matchSel })
        this.showMatch = false; this.matchProject = null
      } catch (e) { this.matchErr = e.message || '저장 실패' }
      this.matchSaving = false
    },
  },
  watch: {
    delStage() { this.refreshIcons() },
  },
}
