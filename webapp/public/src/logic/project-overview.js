export default {
  data() {
    return {
      id: '',
      project: { name: '', base_url: '', platform: '' },
      stats: { runs: 0, openIssues: 0, issuesBySev: [], issuesByCat: [], latest: null },
      segByLit: [],
    }
  },
  async mounted() {
    this.id = this.getParam('id')
    try {
      const r = await this.$api.get('/api/projects/' + this.id)
      this.project = r.project || this.project
      this.stats = r.stats || this.stats
      this.segByLit = r.segByLit || []
    } catch (e) { /* noop */ }
  },
  methods: {
    recoLabel(rc) { return window.qa.recoLabel(rc) },
    sev(k) { const x = (this.stats.issuesBySev || []).find((s) => s.severity === k); return x ? x.c : 0 },
    rate(gp) { return gp.total ? Math.round((gp.completed / gp.total) * 100) : 0 },
  },
}
