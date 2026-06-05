export default {
  data() {
    return {
      id: '',
      project: { name: '' },
      saved: [],
      poolSize: 0,
      audience: '',
      count: 12,
      cands: [],
      info: null,
      extracting: false,
      generating: false,
      saving: false,
      // 배정 해제 이중 컨펌
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
      const r = await this.$api.get('/api/projects/' + this.id + '/personas')
      this.project = r.project || this.project
      this.saved = r.saved || []
      this.poolSize = r.poolSize || 0
    } catch (e) { /* noop */ }
  },
  computed: {
    checkedCount() { return this.cands.filter((p) => p._checked).length },
    someChecked() { const n = this.checkedCount; return n > 0 && n < this.cands.length },
    allChecked: {
      get() { return this.cands.length > 0 && this.cands.every((p) => p._checked) },
      set(v) { this.cands.forEach((p) => { p._checked = v }) },
    },
  },
  methods: {
    async extract() {
      // 인원 검증 — 0·음수·빈값이면 추출하지 않고 인라인 안내(기존 결과 무변경)
      const count = Number(this.count)
      if (!Number.isFinite(count) || count < 1) {
        this.info = { cls: 'text-danger', text: '인원은 1명 이상이어야 합니다.' }
        return
      }
      if (count > 50) { this.info = { cls: 'text-danger', text: '인원은 최대 50명까지 가능합니다.' }; return }
      this.extracting = true
      try {
        const r = await this.$api.post('/api/projects/' + this.id + '/personas/select', { audience: this.audience, count })
        this.cands = (r.personas || []).map((p) => ({ ...p, _checked: true }))
        const short = r.qualified < this.count
        this.info = {
          cls: short ? 'text-warning' : 'muted',
          text: `풀 ${r.total}인 중 조건 적합 ${r.qualified}명 · ${this.cands.length}명 추출`
            + (short ? ' — 적합 인력이 인원보다 적습니다. ‘추가 페르소나 생성하기’를 권장합니다.' : ''),
        }
      } catch (e) { this.info = { cls: 'text-danger', text: '추출 실패: ' + e.message } }
      this.extracting = false
    },
    async generateMore() {
      this.generating = true
      try {
        const { personas } = await this.$api.post('/api/personas/generate', { audience: this.audience, count: Math.min(20, this.count || 5) })
        this.cands = this.cands.concat((personas || []).map((p) => ({ ...p, _checked: true })))
      } catch (e) { alert('생성 실패: ' + e.message + ' (인증 확인 — claude login 또는 ANTHROPIC_API_KEY)') }
      this.generating = false
    },
    async save() {
      const chosen = this.cands.filter((p) => p._checked).map(({ _checked, ...p }) => p)
      if (!chosen.length) { alert('저장할 페르소나를 선택하세요.'); return }
      this.saving = true
      try {
        const r = await this.$api.post('/api/projects/' + this.id + '/personas', { personas: chosen })
        this.cands = []
        this.saved = r.personas || []
        this.poolSize = r.poolSize || this.poolSize
        this.info = {
          cls: 'text-mint',
          text: `✓ ${r.saved}명 배정` + (r.addedToPool ? ` · 인력풀에 ${r.addedToPool}명 신규 등록(풀 ${r.poolSize}인)` : ''),
        }
      } catch (e) { alert('저장 실패: ' + e.message) }
      this.saving = false
    },
    refreshIcons() { this.$nextTick(() => window.qaIcons && window.qaIcons()) },
    openDelete(p) {
      this.delTarget = p
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
        await this.$api.delete('/api/projects/' + this.id + '/personas/' + this.delTarget.rowId)
        this.saved = this.saved.filter((x) => x.rowId !== this.delTarget.rowId)
        this.showDelete = false
        this.delTarget = null
        this.delStage = 1
      } catch (e) { this.delErr = e.message || '삭제 실패' }
      this.delSaving = false
    },
  },
  watch: {
    delStage() { this.refreshIcons() },
    audience() { this.refreshIcons() },
  },
}
