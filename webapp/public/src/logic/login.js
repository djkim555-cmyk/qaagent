export default {
  layout: null,
  data() {
    return {
      mode: 'login',          // 'login' | 'signup'
      loginId: '',
      password: '',
      showPw: false,
      busy: false,
      error: '',
      // 회원가입
      su: { loginId: '', name: '', password: '', contact: '' },
      suError: '',
      suDone: '',
    }
  },
  mounted() { this.$nextTick(() => window.qaIcons && window.qaIcons()) },
  methods: {
    refreshIcons() { this.$nextTick(() => window.qaIcons && window.qaIcons()) },
    setMode(m) {
      this.mode = m
      this.error = ''; this.suError = ''; this.suDone = ''
      this.refreshIcons()
    },
    togglePw() { this.showPw = !this.showPw; this.refreshIcons() },
    async login() {
      if (this.busy) return
      this.error = ''
      if (!this.loginId) { this.error = '아이디를 입력해주세요.'; return }
      if (!this.password) { this.error = '비밀번호를 입력해주세요.'; return }
      this.busy = true
      try {
        const r = await this.$api.post('/api/login', { loginId: this.loginId, password: this.password })
        window.qaRole = r.role || 'manager'   // 로그인 즉시 역할 반영(메뉴 토글)
        this.navigateTo('home')
      } catch (e) {
        this.error = e.message || '로그인에 실패했습니다.'
      }
      this.busy = false
    },
    async signup() {
      if (this.busy) return
      this.suError = ''; this.suDone = ''
      const { loginId, name, password } = this.su
      if (!name.trim()) { this.suError = '이름을 입력해주세요.'; return }
      if (!/^[A-Za-z0-9._-]{4,20}$/.test(loginId.trim())) { this.suError = '아이디는 영문/숫자/._- 4~20자로 입력하세요.'; return }
      if ((password || '').length < 4) { this.suError = '비밀번호는 4자 이상이어야 합니다.'; return }
      this.busy = true
      try {
        const r = await this.$api.post('/api/signup', {
          loginId: loginId.trim(), name: name.trim(), password, contact: (this.su.contact || '').trim(),
        })
        this.suDone = r.message || '가입이 접수되었습니다. 관리자 승인 후 로그인할 수 있습니다.'
        this.su = { loginId: '', name: '', password: '', contact: '' }
      } catch (e) { this.suError = e.message || '회원가입에 실패했습니다.' }
      this.busy = false
    },
  },
}
