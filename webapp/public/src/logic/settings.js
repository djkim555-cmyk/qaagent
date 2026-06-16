export default {
  data() {
    return {
      env: {},
      me: { role: '', name: '', loginId: '' },
      name: '',
      password: '',
      saving: false,
      msg: '',
      err: '',
    }
  },
  async mounted() {
    try {
      const r = await this.$api.get('/api/settings')
      this.env = r.env || {}
      this.me = r.me || this.me
      this.name = this.me.name || ''
    } catch (e) { /* noop */ }
    this.$nextTick(() => window.qaIcons && window.qaIcons())
  },
  computed: {
    isMember() { return this.me.role === 'manager' },
  },
  methods: {
    async saveProfile() {
      this.msg = ''; this.err = ''
      const name = (this.name || '').trim()
      if (!name) { this.err = '이름을 입력하세요.'; return }
      if (this.password && this.password.length < 4) { this.err = '비밀번호는 4자 이상이어야 합니다.'; return }
      this.saving = true
      try {
        const body = { name }
        if (this.password) body.password = this.password
        await this.$api.patch('/api/me', body)
        this.me.name = name
        this.password = ''
        this.msg = '✓ 저장되었습니다.'
      } catch (e) { this.err = e.message || '저장 실패' }
      this.saving = false
      this.$nextTick(() => window.qaIcons && window.qaIcons())
    },
  },
}
