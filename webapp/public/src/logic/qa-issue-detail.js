export default {
  data() {
    return {
      id: '',
      issueId: '',
      project: { name: '' },
      issue: {},
      shots: [],
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
  },
}
