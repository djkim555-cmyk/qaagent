export default {
  data() {
    return {
      managers: [],
      projects: [],
      loaded: false,
      showAdd: false,
      form: { name: '', contact: '', password: '' },
      saving: false,
      err: '',
      // 담당 프로젝트 지정 팝업
      showAssign: false,
      assignFor: null,
      assignSel: [],
      assignSaving: false,
      assignErr: '',
      // 삭제 이중 컨펌 팝업
      showDelete: false,
      delTarget: null,
      delStage: 1,
      delSaving: false,
      delErr: '',
    }
  },
  async mounted() { await this.load() },
  methods: {
    refreshIcons() { this.$nextTick(() => window.qaIcons && window.qaIcons()) },
    async load() {
      try {
        const r = await this.$api.get('/api/managers')
        this.managers = r.managers || []
      } catch (e) {
        // 최고관리자가 아니면 403 → 프로젝트로 돌려보냄
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
    openAdd() {
      this.form = { name: '', contact: '', password: '' }
      this.err = ''
      this.showAdd = true
      this.refreshIcons()
    },
    closeAdd() {
      if (this.saving) return
      this.showAdd = false
    },
    async add() {
      const name = this.form.name.trim()
      if (!name) { this.err = '관리자명을 입력하세요.'; return }
      if ((this.form.password || '').length < 4) { this.err = '비밀번호는 4자 이상이어야 합니다.'; return }
      this.saving = true; this.err = ''
      try {
        await this.$api.post('/api/managers', { name, contact: (this.form.contact || '').trim(), password: this.form.password })
        this.form = { name: '', contact: '', password: '' }
        this.showAdd = false
        await this.load()
      } catch (e) { this.err = e.message || '추가 실패' }
      this.saving = false
    },
    // ── 담당 프로젝트 지정 ──
    openAssign(m) {
      this.assignFor = m
      this.assignSel = this.projects.filter((p) => p.manager_id === m.id).map((p) => p.id)
      this.assignErr = ''
      this.showAssign = true
      this.refreshIcons()
    },
    closeAssign() {
      if (this.assignSaving) return
      this.showAssign = false
      this.assignFor = null
    },
    async saveAssign() {
      if (!this.assignFor) return
      this.assignSaving = true; this.assignErr = ''
      try {
        await this.$api.put('/api/managers/' + this.assignFor.id + '/projects', { projectIds: this.assignSel })
        this.showAssign = false
        this.assignFor = null
        await this.load()
      } catch (e) { this.assignErr = e.message || '저장 실패' }
      this.assignSaving = false
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
    // ── 삭제 이중 컨펌 ──
    openDelete(m) {
      this.delTarget = m
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
        await this.$api.delete('/api/managers/' + this.delTarget.id)
        this.managers = this.managers.filter((x) => x.id !== this.delTarget.id)
        this.showDelete = false
        this.delTarget = null
        this.delStage = 1
        // 해제된 담당 프로젝트 상태 반영
        await this.load()
      } catch (e) { this.delErr = e.message || '삭제 실패' }
      this.delSaving = false
    },
  },
  watch: {
    delStage() { this.refreshIcons() },
  },
}
