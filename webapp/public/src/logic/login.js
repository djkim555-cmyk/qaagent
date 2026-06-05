export default {
  layout: null,
  data() {
    return { password: '', error: '', busy: false, showPw: false }
  },
  mounted() { this.$nextTick(() => window.qaIcons && window.qaIcons()) },
  methods: {
    togglePw() {
      this.showPw = !this.showPw
      this.$nextTick(() => window.qaIcons && window.qaIcons())
    },
    async login() {
      if (this.busy) return
      this.error = ''
      // 빈값과 오입력을 구분 — 빈값은 '입력 안내', 불일치는 서버 메시지(올바르지 않습니다)
      if (!this.password) { this.error = '비밀번호를 입력해주세요.'; return }
      this.busy = true
      try {
        const r = await this.$api.post('/api/login', { password: this.password })
        window.qaRole = r.role || 'manager'   // 로그인 즉시 역할 반영(메뉴 토글)
        this.navigateTo('home')
      } catch (e) {
        this.error = e.message || '로그인에 실패했습니다.'
      }
      this.busy = false
    },
  },
}
