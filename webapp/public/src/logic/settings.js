export default {
  data() {
    return { env: {} }
  },
  async mounted() {
    try {
      const r = await this.$api.get('/api/settings')
      this.env = r.env || {}
    } catch (e) { /* noop */ }
  },
}
