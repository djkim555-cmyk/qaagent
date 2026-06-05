export default {
  data() {
    return { stats: { active: 0, openP1: 0, thisWeek: 0, projects: 0, recent: [] }, projects: [], role: '', loaded: false }
  },
  async mounted() {
    try {
      const r = await this.$api.get('/api/dashboard')
      if (r && r.stats) this.stats = r.stats
      this.projects = (r && r.projects) || []
      this.role = (r && r.role) || ''
    } catch (e) { /* 미인증 시 라우터가 로그인으로 보냄 */ }
    this.loaded = true
    this.$nextTick(() => window.qaIcons && window.qaIcons())
  },
  methods: {
    recoClass(rc) { return window.qa.recoClass(rc) },
    statusLabel(s) { return window.qa.statusLabel(s) },
    fmtDateTime(ms) { return ms ? new Date(ms).toLocaleString('ko-KR') : '' },
    openRun(r) { if (r.project_id) this.navigateTo('run-detail', { id: r.project_id, runId: r.id }) },
    openProject(p) { this.navigateTo('project-overview', { id: p.id }) },
  },
}
