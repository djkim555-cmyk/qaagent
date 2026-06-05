export default {
  data() {
    return {
      id: '',
      runId: '',
      project: { name: '' },
      run: { scenario: '', status: '' },
      status: '',
      statusText: '—',
      cancelling: false,
      logs: [],
      issues: [],
      issuesSummary: '',
      issuesLoaded: false,
      reportHtml: '',
      reportMsg: '실행이 완료되면 통합 리포트가 표시됩니다.',
      es: null,
    }
  },
  async mounted() {
    this.id = this.getParam('id')
    this.runId = this.getParam('runId')
    try {
      const r = await this.$api.get('/api/projects/' + this.id + '/runs/' + this.runId)
      this.project = r.project || this.project
      this.run = r.run || this.run
    } catch (e) { /* noop */ }

    const st = this.run.status
    if (['pending', 'running', 'synthesizing'].includes(st)) {
      this.setStatus(st)
      this.streamLive()
    } else {
      try {
        const d = await this.$api.get('/api/runs/' + this.runId)
        this.setStatus(d.status, d.launchRecommendation)
        this.logs.push({ level: 'muted', t: '', message: `과거 실행 (${window.qa.statusLabel(d.status)}) · 페르소나 ${(d.personaRuns || []).length}명 · 이슈 ${d.issueCount || 0}건` })
        this.loadIssues()
        if (d.status === 'done') this.loadReport()
      } catch (e) { /* noop */ }
    }
  },
  beforeUnmount() { if (this.es) this.es.close() },
  computed: {
    isActive() { return window.qa.isActive(this.status) },
    // 시나리오 파일 경로 → 사람이 읽는 이름 (scenarios/ 접두·.md 확장자 제거)
    scenarioName() { return (this.run.scenario || '').replace('scenarios/', '').replace(/\.md$/, '') || this.runId },
  },
  methods: {
    setStatus(s, reco) { this.status = s; this.statusText = window.qa.statusLabel(s) + (reco ? ' · ' + reco : '') },
    async cancelRun() {
      if (this.cancelling) return
      if (!confirm('이 QA 실행을 중단합니다.\n중단한 실행은 "없는 것"으로 처리되어 리포트·이슈가 모두 삭제되며 복구할 수 없습니다.\n계속할까요?')) return
      this.cancelling = true
      try {
        if (this.es) this.es.close()
        await this.$api.delete('/api/runs/' + this.runId)
        this.navigateTo('project-runs', { id: this.id })
      } catch (e) {
        alert('중단 실패: ' + e.message)
        this.cancelling = false
      }
    },
    async loadIssues() {
      try {
        const { issues } = await this.$api.get('/api/runs/' + this.runId + '/issues')
        this.issues = issues || []
        const counts = this.issues.reduce((m, i) => ((m[i.severity] = (m[i.severity] || 0) + 1), m), {})
        this.issuesSummary = ['Blocker', 'Major', 'Minor', 'Nitpick'].filter((k) => counts[k]).map((k) => `${k} ${counts[k]}`).join(' · ')
      } catch (e) { /* noop */ }
      this.issuesLoaded = true
    },
    async loadReport() {
      try {
        const r = await fetch('/api/runs/' + this.runId + '/report')
        if (r.ok) this.reportHtml = window.marked.parse(await r.text())
        else this.reportMsg = '리포트 파일을 찾지 못했습니다.'
      } catch (e) { this.reportMsg = '리포트 파일을 찾지 못했습니다.' }
    },
    streamLive() {
      this.reportMsg = '실행 중…'
      this.es = new EventSource('/api/runs/' + this.runId + '/events')
      this.es.onmessage = (m) => {
        const e = JSON.parse(m.data)
        this.logs.push({ level: e.level, t: new Date(e.ts).toLocaleTimeString('ko-KR'), message: e.message })
      }
      this.es.addEventListener('end', (m) => {
        this.es.close()
        const run = JSON.parse(m.data)
        this.setStatus(run.status, run.launchRecommendation)
        this.loadIssues()
        if (run.status === 'done') this.loadReport()
      })
    },
  },
}
