function order(obj, keys) { return keys.filter((k) => obj && obj[k] != null).map((k) => [k, obj[k]]) }

export default {
  data() {
    return {
      personas: [], dist: {}, meta: {},
      q: '', fAge: '', fLit: '', fDev: '', fAcc: '',
      isSuper: false,
      // AI 대화형 추가 모달
      showAdd: false, saving: false, err: '', savedTag: '',
      bubbles: [], messages: [], draft: '', sending: false,
      persona: null,
    }
  },
  async mounted() {
    await this.load()
    try { const e = await this.$api.get('/api/env'); this.isSuper = (e.role === 'super') } catch (err) { /* noop */ }
  },
  computed: {
    ageRows() { return order(this.dist.ageBand, ['10대', '20대', '30대', '40대', '50대', '60대+']) },
    litRows() { return order(this.dist.digitalLiteracy, ['상', '중', '하']) },
    devRows() { return order(this.dist.primaryDevice, ['모바일', 'PC', '둘다']) },
    accRows() { return Object.entries(this.dist.accessibility || {}) },
    accTotal() { return Object.values(this.dist.accessibility || {}).reduce((a, b) => a + b, 0) },
    filtered() {
      const s = this.q.trim().toLowerCase()
      return this.personas.filter((p) => {
        const hay = [p.name, p.occupation, p.region, p.city, p.quote, p.goals, (p.accessibility || []).join(' ')].join(' ').toLowerCase()
        return (!s || hay.includes(s))
          && (!this.fAge || p.ageBand === this.fAge)
          && (!this.fLit || p.digitalLiteracy === this.fLit)
          && (!this.fDev || p.primaryDevice === this.fDev)
          && (!this.fAcc || (p.accessibility || []).includes(this.fAcc))
      })
    },
  },
  methods: {
    pct(n) { return this.personas.length ? Math.round((n / this.personas.length) * 100) : 0 },
    g(k) { return this.dist.gender ? (this.dist.gender[k] || 0) : 0 },
    r(k) { return this.dist.region ? (this.dist.region[k] || 0) : 0 },
    lit(k) { return this.dist.digitalLiteracy ? (this.dist.digitalLiteracy[k] || 0) : 0 },
    refreshIcons() { this.$nextTick(() => window.qaIcons && window.qaIcons()) },
    scrollChat() { this.$nextTick(() => { const el = this.$refs.chat; if (el) el.scrollTop = el.scrollHeight }) },
    async load() {
      try {
        const r = await this.$api.get('/api/personas/seed')
        this.personas = r.personas || []
        this.dist = r.dist || {}
        this.meta = r.meta || {}
      } catch (e) { /* noop */ }
    },
    openAdd() {
      this.err = ''
      this.savedTag = ''
      this.persona = null
      this.draft = ''
      this.messages = []
      this.bubbles = [{ cls: 'assistant', text: '안녕하세요. 어떤 사용자를 페르소나로 추가할까요? 연령·디지털 친숙도·기기·직업·접근성 특성 등을 자유롭게 알려주시면 한 명을 구성해 드릴게요. (예: "60대 초반 농업, 노안 있고 스마트폰만 쓰는 어르신")' }]
      this.showAdd = true
      this.scrollChat()
      this.refreshIcons()
    },
    closeAdd() {
      if (this.sending || this.saving) return
      this.showAdd = false
    },
    onKey(e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.send() } },
    async send() {
      const text = this.draft.trim()
      if (!text || this.sending) return
      this.draft = ''; this.sending = true; this.err = ''
      this.bubbles.push({ cls: 'user', text })
      this.messages.push({ role: 'user', content: text })
      this.bubbles.push({ cls: 'assistant thinking', text: '생각 중…' })
      this.scrollChat()
      try {
        const out = await this.$api.post('/api/personas/chat', { messages: this.messages })
        this.bubbles.pop()
        this.bubbles.push({ cls: 'assistant', text: out.reply })
        this.messages.push({ role: 'assistant', content: out.reply })
        if (out.persona) { this.persona = out.persona; this.savedTag = '' }
      } catch (e) {
        this.bubbles.pop()
        this.bubbles.push({ cls: 'assistant', text: '오류: ' + (e.message || '대화 실패') + ' (인증 확인 — claude login 또는 ANTHROPIC_API_KEY)' })
      }
      this.sending = false
      this.refreshIcons()
      this.scrollChat()
    },
    async save() {
      if (!this.persona) { this.err = '먼저 AI와 대화해 페르소나 초안을 만들어 주세요.'; return }
      const name = (this.persona.name || '').trim()
      const age = Number(this.persona.age)
      if (!name) { this.err = '초안에 이름이 없습니다. AI에게 이름을 정해 달라고 해보세요.'; return }
      if (!Number.isFinite(age) || age < 1 || age > 120) { this.err = '초안의 나이가 올바르지 않습니다.'; return }
      this.saving = true; this.err = ''
      try {
        const r = await this.$api.post('/api/personas/seed', this.persona)
        await this.load()
        this.savedTag = '· 추가됨: ' + (r.persona ? r.persona.id : '')
        this.bubbles.push({ cls: 'assistant', text: '「' + name + '」 페르소나를 시드 풀에 추가했습니다' + (r.persona ? ' (ID ' + r.persona.id + ')' : '') + '. 계속 만들거나 닫으셔도 됩니다.' })
        this.persona = null
        this.messages = []
        this.refreshIcons()
        this.scrollChat()
      } catch (e) { this.err = e.message || '추가 실패' }
      this.saving = false
    },
  },
}
