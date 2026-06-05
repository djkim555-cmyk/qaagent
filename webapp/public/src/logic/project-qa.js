export default {
  data() {
    return {
      id: '',
      project: { name: '' },
      issues: [],
      runs: [],
      developers: [],
      categories: [],
      statuses: [],
      loaded: false,
      // 컬럼 필터
      columns: [
        { key: 'ordinal', label: '회차' },
        { key: 'severity', label: '심각도' },
        { key: 'scenario', label: '시나리오' },
        { key: 'title', label: '제목' },
        { key: 'type', label: '유형' },
        { key: 'persona', label: '페르소나' },
        { key: 'category', label: '구분' },
        { key: 'assignee', label: '담당자' },
        { key: 'status', label: '상태' },
      ],
      colFilters: { ordinal: [], severity: [], scenario: [], title: [], type: [], persona: [], category: [], assignee: [], status: [] },
      query: '',
      openCol: null,
      popPos: { top: 0, left: 0 },
      // 저장(변경분 일괄)
      dirty: {},
      saving: false,
      savedMsg: '',
      savedErr: false,
      // 메모 팝업
      showMemo: false,
      memoTarget: null,
      memoDraft: '',
      memoSaving: false,
    }
  },
  async mounted() {
    this.id = this.getParam('id')
    try {
      const r = await this.$api.get('/api/projects/' + this.id + '/qa')
      this.project = r.project || this.project
      this.issues = (r.issues || []).map((i) => ({
        ...i,
        status: i.status || '열림',
        category: i.category || '',
        assignee_id: i.assignee_id == null ? null : i.assignee_id,
        memo: i.memo || '',
      }))
      this.runs = r.runs || []
      this.developers = r.developers || []
      this.categories = r.categories || []
      this.statuses = r.statuses || []
    } catch (e) { /* noop */ }
    // 개요 배너 등에서 ?sev=P1 로 진입하면 심각도 필터를 P1(Blocker+Major)로 미리 적용
    if (this.getParam('sev') === 'P1') this.colFilters.severity = ['Blocker', 'Major']
    this.loaded = true
    this.refreshIcons()
  },
  computed: {
    // 실행 시작시각 오름차순 → 회차(1차·2차…) 매핑
    ordinalMap() {
      const sorted = [...this.runs].sort((a, b) => (a.started_at || 0) - (b.started_at || 0))
      const m = {}
      sorted.forEach((r, i) => { m[r.id] = i + 1 })
      return m
    },
    dirtyCount() { return Object.keys(this.dirty).length },
    // 처리 현황 대시보드 집계 (현재 리스트 상태 기준)
    statusCounts() {
      const c = { '열림': 0, '진행중': 0, '완료': 0, '보류': 0 }
      for (const i of this.issues) { const s = i.status || '열림'; if (c[s] != null) c[s]++ }
      return c
    },
    donePct() { return this.issues.length ? Math.round((this.statusCounts['완료'] / this.issues.length) * 100) : 0 },
    openP1Count() {
      return this.issues.filter((i) => (i.severity === 'Blocker' || i.severity === 'Major') && (i.status || '열림') !== '완료').length
    },
    anyFilter() { return Object.values(this.colFilters).some((a) => a && a.length) || !!this.query.trim() },
    filtered() {
      const keys = Object.keys(this.colFilters)
      const q = this.query.trim().toLowerCase()
      return this.issues.filter((i) => {
        for (const key of keys) {
          const sel = this.colFilters[key]
          if (sel && sel.length && !sel.includes(this.cellVal(key, i))) return false
        }
        if (q) {
          const hay = [i.title, i.scenario, i.persona_id, i.persona_name, i.type, i.category, i.severity]
            .filter(Boolean).join(' ').toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
    },
  },
  methods: {
    refreshIcons() { this.$nextTick(() => window.qaIcons && window.qaIcons()) },
    ordinal(runId) { return this.ordinalMap[runId] || 1 },
    pct(status) { return this.issues.length ? (this.statusCounts[status] / this.issues.length) * 100 : 0 },
    openIssue(i) { this.navigateTo('qa-issue-detail', { id: this.id, issueId: i.id }) },
    devName(devId) {
      if (devId == null || devId === '') return '미배정'
      const d = this.developers.find((x) => x.id === devId)
      return d ? d.name : '#' + devId
    },
    colLabel(key) { const c = this.columns.find((x) => x.key === key); return c ? c.label : key },
    // 페르소나 컬럼: "ID (이름)" — 이름 없으면 ID 만
    personaLabel(i) {
      const pid = i.persona_id || ''
      const name = i.persona_name || ''
      if (pid && name) return pid + ' (' + name + ')'
      return pid || name || ''
    },
    // 필터/표시용 컬럼 값
    cellVal(key, i) {
      switch (key) {
        case 'ordinal': return String(i.run_id == null ? '' : i.run_id)
        case 'severity': return i.severity || ''
        case 'scenario': return i.scenario || ''
        case 'title': return i.title || ''
        case 'type': return i.type || ''
        case 'persona': return i.persona_id || ''
        case 'category': return i.category || ''
        case 'assignee': return i.assignee_id == null ? '' : String(i.assignee_id)
        case 'status': return i.status || '열림'
        default: return ''
      }
    },
    cellText(key, i) {
      switch (key) {
        case 'ordinal': return this.ordinal(i.run_id) + '차'
        case 'scenario': return (i.scenario || '').replace('scenarios/', '')
        case 'severity': return i.severity || '-'
        case 'category': return i.category || '미분류'
        case 'assignee': return this.devName(i.assignee_id)
        case 'persona': return this.personaLabel(i) || '-'
        case 'title': return i.title || '(제목 없음)'
        default: return this.cellVal(key, i) || '-'
      }
    },
    distinct(key) {
      const m = new Map()
      for (const i of this.issues) {
        const v = this.cellVal(key, i)
        if (!m.has(v)) m.set(v, { val: v, text: this.cellText(key, i), count: 0 })
        m.get(v).count++
      }
      const arr = [...m.values()]
      if (key === 'ordinal') arr.sort((a, b) => (this.ordinalMap[a.val] || 0) - (this.ordinalMap[b.val] || 0))
      else if (key === 'severity') {
        const order = { Blocker: 0, Major: 1, Minor: 2, Nitpick: 3, '': 9 }
        arr.sort((a, b) => (order[a.val] ?? 8) - (order[b.val] ?? 8))
      } else arr.sort((a, b) => String(a.text).localeCompare(String(b.text), 'ko'))
      return arr
    },
    // ── 필터 팝오버 ──
    toggleCol(key, ev) {
      if (this.openCol === key) { this.openCol = null; return }
      const r = ev.currentTarget.getBoundingClientRect()
      this.popPos = { top: r.bottom + 4, left: Math.min(r.left, window.innerWidth - 240) }
      this.openCol = key
      this.refreshIcons()
    },
    selectAllCol(key) { this.colFilters[key] = this.distinct(key).map((d) => d.val) },
    clearCol(key) { this.colFilters[key] = [] },
    clearAllFilters() { for (const k of Object.keys(this.colFilters)) this.colFilters[k] = []; this.query = ''; this.openCol = null },
    // ── 변경/저장 ──
    markDirty(i) { this.dirty = { ...this.dirty, [i.id]: true } },
    async save() {
      const ids = Object.keys(this.dirty)
      if (!ids.length) { this.savedErr = false; this.savedMsg = '변경사항이 없습니다.'; return }
      this.saving = true; this.savedMsg = ''
      try {
        for (const idStr of ids) {
          const i = this.issues.find((x) => String(x.id) === idStr)
          if (!i) continue
          await this.$api.patch('/api/issues/' + i.id, { category: i.category, assigneeId: i.assignee_id, status: i.status })
        }
        this.dirty = {}
        this.savedErr = false
        this.savedMsg = '✓ ' + ids.length + '건 저장되었습니다.'
      } catch (e) { this.savedErr = true; this.savedMsg = '저장 실패: ' + e.message }
      this.saving = false
    },
    // ── 메모 ──
    openMemo(i) {
      this.memoTarget = i
      this.memoDraft = i.memo || ''
      this.showMemo = true
      this.refreshIcons()
    },
    closeMemo() { if (this.memoSaving) return; this.showMemo = false; this.memoTarget = null },
    async saveMemo() {
      if (!this.memoTarget) return
      this.memoSaving = true
      try {
        await this.$api.patch('/api/issues/' + this.memoTarget.id, { memo: this.memoDraft })
        this.memoTarget.memo = this.memoDraft
        this.showMemo = false
        this.memoTarget = null
      } catch (e) { alert('저장 실패: ' + e.message) }
      this.memoSaving = false
    },
  },
}
