export default {
  data() {
    return {
      id: '',
      issueId: '',
      project: { name: '' },
      issue: {},
      shots: [],
      // 트리아지 편집(상세) — 변경 즉시 저장
      developers: [],
      categories: [],
      statuses: [],
      saving: false,
      saved: false,
      saveErr: '',
      loaded: false,
    }
  },
  async mounted() {
    this.id = this.getParam('id')
    this.issueId = this.getParam('issueId')
    try {
      const r = await this.$api.get('/api/issues/' + this.issueId)
      this.issue = r.issue || {}
      this.shots = r.shots || []
      this.developers = r.developers || []
      this.categories = r.categories || []
      this.statuses = r.statuses || []
    } catch (e) { /* noop */ }
    try {
      const p = await this.$api.get('/api/projects/' + this.id)
      this.project = p.project || this.project
    } catch (e) { /* noop */ }
    this.loaded = true
    this.$nextTick(() => window.qaIcons && window.qaIcons())
  },
  computed: {
    symptom() {
      return this.issue.symptom || this.issue.evidence || '(현상 정보가 기록되지 않았습니다. report.md 를 확인하세요.)'
    },
    // 재현 단계: 저장은 줄바꿈 구분 텍스트 → 배열로 분해(빈 줄 제거)
    reproSteps() {
      const raw = this.issue.repro
      if (!raw) return []
      return String(raw).split(/\r?\n/).map((s) => s.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean)
    },
    hasExpectedActual() { return !!(this.issue.expected || this.issue.actual) },
  },
  methods: {
    openRun() { if (this.issue.run_id) this.navigateTo('run-detail', { id: this.id, runId: this.issue.run_id }) },
    // 구분/상태/담당자/메모 변경 즉시 저장 (리스트 화면과 동일한 PATCH)
    async saveField() {
      this.saving = true; this.saved = false; this.saveErr = ''
      try {
        await this.$api.patch('/api/issues/' + this.issueId, {
          category: this.issue.category,
          assigneeId: this.issue.assignee_id,
          status: this.issue.status,
          memo: this.issue.memo,
        })
        this.saved = true
        setTimeout(() => { this.saved = false }, 2500)
      } catch (e) { this.saveErr = e.message }
      this.saving = false
    },
  },
}
