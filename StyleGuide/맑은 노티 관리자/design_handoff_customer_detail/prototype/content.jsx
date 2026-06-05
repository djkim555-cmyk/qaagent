/* Main content — Customer Detail (Nuxt UI styled) */

const ACCOUNTS = [
  { id:"admin2",   name:"홍길동", role:"슈퍼관리자", email:"hong@chunhyang.co.kr",       phone:"010-1234-5678", channels:["PUSH","RCS","SMS"], status:"활성", login:"2026.09.05 14:22" },
  { id:"Oja",      name:"김영자", role:"운영자",     email:"Oja@chunhyang.co.kr",         phone:"010-2345-6789", channels:["PUSH","SMS"],       status:"활성", login:"2026.09.05 11:08" },
  { id:"CS22",     name:"최덕구", role:"고객지원",   email:"deokgu@chunhyang.co.kr",      phone:"010-3456-7890", channels:["SMS"],             status:"활성", login:"2026.09.04 18:33" },
  { id:"acct01",   name:"이몽룡", role:"회계",       email:"lee@chunhyang.co.kr",         phone:"010-4567-8901", channels:["—"],               status:"활성", login:"2026.09.03 09:11" },
  { id:"sys-bot",  name:"발송봇", role:"시스템",     email:"bot@chunhyang.co.kr",         phone:"—",             channels:["PUSH","RCS","SMS"], status:"활성", login:"방금 전" },
  { id:"viewer01", name:"성춘향", role:"조회 전용",  email:"chunhyang@chunhyang.co.kr",   phone:"010-5678-9012", channels:["—"],               status:"중지", login:"2026.08.21 16:00" },
  { id:"ops-dev",  name:"방자",   role:"운영자",     email:"bangja@chunhyang.co.kr",      phone:"010-6789-0123", channels:["PUSH","RCS"],       status:"활성", login:"2026.09.05 10:42" },
  { id:"qa-lab",   name:"허지운", role:"검수자",     email:"heo@chunhyang.co.kr",         phone:"010-7890-1234", channels:["RCS"],             status:"휴면", login:"2026.07.12 12:30" },
];

const MEMOS = [
  { who:"홍길동(admin2)", at:"2026.09.05", title:"계약 갱신완료",            body:"계약 갱신 체결 완료 확인.\n기간 연장 및 서비스 담당자에게 안내 완료.", tone:"success" },
  { who:"최덕구(CS22)",   at:"2026.09.05", title:"계약 갱신 진행요청",        body:"서비스 담당자 허지운님이 계약 갱신 문의.\n계약 갱신을 요청함.\n영업팀에 전달하여 진행요청하여 전자계약 등록완료.", tone:"primary" },
  { who:"김영자(Oja)",    at:"2026.09.03", title:"PUSH 인증 키 만료 7일 전",  body:"FCM 서버키 만료 임박. 고객사 담당자에게 재발급 요청 메일 발송.", tone:"warning" },
  { who:"방자(ops-dev)",  at:"2026.08.28", title:"RCS 브랜드 승인 완료",       body:"RCS Biz Center에서 '(주)춘향뎐' 브랜드 정식 승인. 발송 채널 활성화함.", tone:"primary" },
  { who:"허지운(QA)",     at:"2026.08.21", title:"월간 사용량 점검",           body:"8월 발송량 1.2M건 처리 완료. 실패율 0.4% 정상 범위.", tone:"neutral" },
];

const TABS = ["기본 정보","계정 관리","발송 내역","크레딧","감사 로그","API 키"];

/* ---------- TopBar ---------- */
function TopBar({ onToggleSidebar, onToggleMemo }) {
  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-10">
      <div className="flex items-center gap-4">
        <UButton variant="ghost" size="md" square icon="panel-left" onClick={onToggleSidebar} />

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm">
          <UIcon name="home" className="size-3.5 text-slate-400" />
          <UIcon name="chevron-right" className="size-3.5 text-slate-300" />
          <span className="text-slate-500">회원/고객사</span>
          <UIcon name="chevron-right" className="size-3.5 text-slate-300" />
          <span className="text-slate-500">고객사</span>
          <UIcon name="chevron-right" className="size-3.5 text-slate-300" />
          <span className="text-slate-900 font-medium">(주)춘향뎐</span>
        </nav>
      </div>

      <div className="flex items-center gap-2">
        {/* System status pill */}
        <div className="hidden lg:inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-emerald-50 ring-1 ring-inset ring-emerald-200">
          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs text-emerald-700 font-medium">시스템 정상 · 14ms</span>
        </div>

        <UButton variant="ghost" size="md" square icon="search" />
        <span className="relative inline-flex">
          <UButton variant="ghost" size="md" square icon="bell" />
          <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-red-500 ring-2 ring-white pointer-events-none" />
        </span>
        <UButton variant="ghost" size="md" square icon="notebook-pen" onClick={onToggleMemo} />

        <USeparator vertical className="mx-1 h-6" />

        {/* Company switcher */}
        <button className="inline-flex items-center gap-2 h-8 px-3 rounded-full ring-1 ring-slate-200 hover:bg-slate-50 transition-colors">
          <UIcon name="building-2" className="size-3.5 text-slate-500" />
          <span className="text-xs text-slate-700 font-medium">맑은소프트</span>
          <UIcon name="chevron-down" className="size-3 text-slate-400" />
        </button>

        {/* User chip */}
        <button className="inline-flex items-center gap-2 h-8 pl-1 pr-2.5 rounded-full ring-1 ring-slate-200 hover:bg-slate-50 transition-colors">
          <UAvatar name="홍" size="sm" />
          <span className="text-xs text-slate-800 font-medium">홍길동</span>
          <UIcon name="chevron-down" className="size-3 text-slate-400" />
        </button>
      </div>
    </header>
  );
}

/* ---------- Page Header ---------- */
function PageHeader({ onOpenChange }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-5">
      <div>
        <div className="text-xs text-slate-500 mb-1">회원/고객사 · 고객사 상세</div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">(주)춘향뎐</h1>
          <UBadge color="primary" variant="subtle">법인사업자</UBadge>
          <UBadge color="warning" variant="subtle">계약 갱신</UBadge>
          <UBadge color="neutral" variant="subtle">CID 0000-2241</UBadge>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <UButton variant="outline" icon="message-square-share">메시지 발송</UButton>
        <UButton variant="outline" icon="file-down">상세 PDF</UButton>
        <UButton variant="outline" icon="user-cog" onClick={onOpenChange}>계정 권한 변경</UButton>
        <UButton color="primary" variant="solid" icon="zap">크레딧 충전</UButton>
      </div>
    </div>
  );
}

/* ---------- Info card ---------- */
function InfoCard() {
  const kpis = [
    { label:"멀티 계정", icon:"users-round",            value:"8개",              sub:"활성 6 · 휴면 2" },
    { label:"계약 상태", icon:"signature",              value:"계약 갱신",         sub:"D-32", emphasis:"warning" },
    { label:"이용 기간", icon:"calendar-clock",         value:"26.09.03 → 27.08.02", sub:"11개월 잔여" },
    { label:"단가 구간", icon:"layers",                 value:"Gold Tier",        sub:"₩5.4 / SMS · ₩42 / RCS" },
    { label:"잔여 크레딧", icon:"wallet",               value:"950,000",          sub:"≒ ₩9,450,000", emphasis:"primary" },
  ];
  return (
    <div className="bg-white rounded-lg ring-1 ring-slate-200 overflow-hidden mb-4">
      <div className="grid grid-cols-[280px_1fr]">
        {/* Left identity panel */}
        <div className="bg-slate-50 border-r border-slate-200 p-5 flex flex-col gap-2">
          <div className="flex items-center gap-2 mb-1">
            <UBadge color="primary" variant="subtle">법인사업자</UBadge>
            <span className="text-xs text-slate-500 tabular-nums">104-81-22418</span>
          </div>
          <div className="text-xl font-bold text-slate-900 tracking-tight">(주)춘향뎐</div>
          <div className="text-xs text-slate-500 space-y-1 mt-1">
            <div className="flex items-center gap-1.5">
              <UIcon name="user-round" className="size-3.5" />
              <span>대표 성춘향, 이몽룡</span>
            </div>
            <div className="flex items-center gap-1.5">
              <UIcon name="calendar" className="size-3.5" />
              <span>가입 2026.09.02 12:12</span>
            </div>
            <div className="flex items-center gap-1.5">
              <UIcon name="map-pin" className="size-3.5" />
              <span>서울 강남구 테헤란로 152</span>
            </div>
          </div>
        </div>
        {/* KPIs */}
        <div className="grid grid-cols-5">
          {kpis.map((k, i) => (
            <div key={k.label} className={cx(
              "px-5 py-5 flex flex-col gap-1",
              i > 0 && "border-l border-dashed border-slate-200",
            )}>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                <UIcon name={k.icon} className="size-3.5" />
                {k.label}
              </div>
              <div className={cx(
                "text-lg font-semibold tracking-tight",
                k.emphasis === "warning" ? "text-amber-700" :
                k.emphasis === "primary" ? "text-primary-700" : "text-slate-900",
              )}>{k.value}</div>
              <div className="text-[11px] text-slate-400">{k.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- UTabs ---------- */
function UTabs({ tabs, value, onChange }) {
  return (
    <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg mb-4">
      {tabs.map(t => (
        <button key={t} onClick={() => onChange(t)} className={cx(
          "h-8 px-3.5 rounded-md text-sm transition-all",
          value === t
            ? "bg-white text-slate-900 font-semibold shadow-sm"
            : "text-slate-500 hover:text-slate-700 font-medium",
        )}>{t}</button>
      ))}
    </div>
  );
}

/* ---------- Filter Panel ---------- */
function FilterPanel() {
  const [role, setRole] = React.useState("all");
  const [status, setStatus] = React.useState("all");
  const [channel, setChannel] = React.useState("all");
  const [period, setPeriod] = React.useState("7d");
  return (
    <div className="bg-slate-50 rounded-lg ring-1 ring-slate-100 p-5 mb-4">
      <div className="grid grid-cols-2 gap-x-8 gap-y-3.5">
        <div className="grid grid-cols-[80px_1fr] items-center gap-3">
          <label className="text-sm text-slate-700 font-medium">권한</label>
          <USelect value={role} onChange={setRole} width={240} options={[
            { value:"all",   label:"전체 권한" },
            { value:"super", label:"슈퍼관리자" },
            { value:"ops",   label:"운영자" },
            { value:"audit", label:"검수자" },
            { value:"view",  label:"조회 전용" },
          ]} />
        </div>
        <div className="grid grid-cols-[80px_1fr] items-center gap-3">
          <label className="text-sm text-slate-700 font-medium">채널 권한</label>
          <USelect value={channel} onChange={setChannel} width={240} options={[
            { value:"all",  label:"전체 채널" },
            { value:"push", label:"PUSH" },
            { value:"rcs",  label:"RCS" },
            { value:"sms",  label:"SMS/LMS" },
          ]} />
        </div>

        <div className="grid grid-cols-[80px_1fr] items-center gap-3">
          <label className="text-sm text-slate-700 font-medium">상태</label>
          <div className="flex flex-wrap gap-1.5">
            {[["all","전체"],["active","활성"],["sleep","휴면"],["stop","중지"]].map(([k,v]) => (
              <button key={k} onClick={() => setStatus(k)} className={cx(
                "h-7 px-3 rounded-full text-xs font-medium ring-1 ring-inset transition-colors",
                status === k
                  ? "bg-primary-50 ring-primary-500 text-primary-700"
                  : "bg-white ring-slate-200 text-slate-600 hover:bg-slate-50",
              )}>{v}</button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-[80px_1fr] items-center gap-3">
          <label className="text-sm text-slate-700 font-medium">최근 접속</label>
          <div className="flex items-center gap-2">
            <USelect value={period} onChange={setPeriod} width={120} options={[
              { value:"1d", label:"오늘" }, { value:"7d", label:"최근 7일" }, { value:"30d", label:"최근 30일" }, { value:"custom", label:"직접 설정" },
            ]} />
            <div className="flex-1 h-8 rounded-md bg-white ring-1 ring-inset ring-slate-200 px-3 inline-flex items-center gap-2 text-xs text-slate-700">
              <UIcon name="calendar" className="size-3.5 text-slate-400" />
              <span>2026.09.01</span>
              <span className="text-slate-300">~</span>
              <UIcon name="calendar" className="size-3.5 text-slate-400" />
              <span>2026.09.30</span>
            </div>
          </div>
        </div>

        <div className="col-span-2 grid grid-cols-[80px_1fr] items-center gap-3">
          <label className="text-sm text-slate-700 font-medium">검색어</label>
          <div className="flex gap-2">
            <USelect value="all" onChange={()=>{}} width={140} options={[
              { value:"all", label:"전체" }, { value:"id", label:"아이디" }, { value:"name", label:"이름" }, { value:"email", label:"이메일" },
            ]} />
            <UInput icon="search" placeholder="아이디, 이름, 이메일 검색" />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-4">
        <UButton variant="ghost" icon="rotate-ccw">초기화</UButton>
        <UButton color="primary" variant="solid" icon="search">조회</UButton>
      </div>
    </div>
  );
}

/* ---------- Accounts Table ---------- */
function AccountsTable({ onChangePermission }) {
  const [selected, setSelected] = React.useState(new Set(["Oja"]));
  const allChecked = selected.size === ACCOUNTS.length;
  const toggle = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(ACCOUNTS.map(a => a.id)));

  const statusBadge = (s) => s === "활성"
    ? <UBadge color="success" variant="subtle" icon="circle-check">활성</UBadge>
    : s === "휴면"
      ? <UBadge color="warning" variant="subtle" icon="circle-pause">휴면</UBadge>
      : <UBadge color="error" variant="subtle" icon="circle-x">중지</UBadge>;

  const roleColor = { "슈퍼관리자":"error", "운영자":"primary", "검수자":"indigo", "회계":"warning", "고객지원":"success", "시스템":"neutral", "조회 전용":"neutral" };
  const chanClass = (c) =>
    c === "PUSH" ? "bg-indigo-50 text-indigo-700 ring-indigo-500/20" :
    c === "RCS"  ? "bg-primary-50 text-primary-700 ring-primary-500/20" :
    c === "SMS"  ? "bg-emerald-50 text-emerald-700 ring-emerald-500/20" :
                   "bg-slate-50 text-slate-400 ring-slate-200";

  return (
    <div className="bg-white rounded-lg ring-1 ring-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 flex items-center justify-between border-b border-slate-100">
        <div className="flex items-baseline gap-2">
          <h3 className="text-[15px] font-semibold text-slate-900">계정 목록</h3>
          <span className="text-xs text-slate-400">
            총 <b className="text-slate-700">8건</b> · 선택 {selected.size}건
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <UButton variant="outline" size="sm" icon="mail" disabled={!selected.size}>임시 비밀번호 발송</UButton>
          <UButton variant="outline" size="sm" icon="pause" disabled={!selected.size}>이용 중지</UButton>
          <UButton variant="outline" size="sm" icon="download">엑셀</UButton>
          <UButton color="primary" variant="solid" size="sm" icon="plus">계정 추가</UButton>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto scroll-thin">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/60 text-slate-500">
            <tr>
              <th className="px-4 py-2.5 w-10 text-left font-medium">
                <UCheckbox checked={allChecked} indeterminate={selected.size > 0 && !allChecked} onChange={toggleAll} />
              </th>
              {["아이디","이름","권한","이메일","연락처","채널 권한","상태","최근 접속"].map(h => (
                <th key={h} className="px-4 py-2.5 text-left font-medium text-xs uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
              <th className="w-12" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ACCOUNTS.map(a => (
              <tr key={a.id} className={cx("transition-colors", selected.has(a.id) ? "bg-primary-50/60" : "hover:bg-slate-50/60")}>
                <td className="px-4 py-3">
                  <UCheckbox checked={selected.has(a.id)} onChange={() => toggle(a.id)} />
                </td>
                <td className="px-4 py-3">
                  <a className="text-primary-700 font-semibold hover:underline cursor-pointer">{a.id}</a>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <UAvatar name={a.name} size="sm" />
                    <span className="text-slate-900">{a.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <UBadge color={roleColor[a.role] || "neutral"} variant="subtle">{a.role}</UBadge>
                </td>
                <td className="px-4 py-3 text-slate-700">{a.email}</td>
                <td className="px-4 py-3 text-slate-600 tabular-nums">{a.phone}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    {a.channels.map((c, i) => (
                      <span key={i} className={cx("inline-flex items-center h-5 px-1.5 rounded text-[10px] font-semibold ring-1 ring-inset", chanClass(c))}>{c}</span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">{statusBadge(a.status)}</td>
                <td className="px-4 py-3 text-xs text-slate-500 tabular-nums">{a.login}</td>
                <td className="px-4 py-3">
                  <UButton variant="ghost" size="sm" square icon="ellipsis" onClick={onChangePermission} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="px-5 py-3 flex items-center justify-between border-t border-slate-100">
        <span className="text-xs text-slate-500">1 – 8 / <b className="text-slate-700">8</b>건</span>
        <div className="flex items-center gap-1">
          <UButton variant="outline" size="sm" square icon="chevrons-left" />
          <UButton variant="outline" size="sm" square icon="chevron-left" />
          {[1,2,3].map(n => (
            <button key={n} className={cx(
              "size-7 rounded-md text-xs font-medium ring-1 ring-inset transition-colors",
              n === 1 ? "ring-primary-500 bg-primary-50 text-primary-700" : "ring-slate-200 bg-white text-slate-600 hover:bg-slate-50",
            )}>{n}</button>
          ))}
          <UButton variant="outline" size="sm" square icon="chevron-right" />
          <UButton variant="outline" size="sm" square icon="chevrons-right" />
          <USelect value="10" onChange={()=>{}} className="ml-2" width={80} size="sm" options={[
            { value:"10", label:"10건" }, { value:"20", label:"20건" }, { value:"50", label:"50건" },
          ]} />
        </div>
      </div>
    </div>
  );
}

/* ---------- Memo Composer ---------- */
const MEMO_CATEGORIES = [
  { key: "general",  label: "일반",     dot: "bg-slate-400" },
  { key: "contract", label: "계약/갱신", dot: "bg-primary-500" },
  { key: "send",     label: "발송",     dot: "bg-indigo-500" },
  { key: "incident", label: "장애",     dot: "bg-red-500" },
  { key: "cs",       label: "CS 응대",  dot: "bg-amber-500" },
];

function MemoComposer() {
  const [open, setOpen] = React.useState(false);
  const [cat, setCat] = React.useState("general");
  const [catOpen, setCatOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const bodyRef = React.useRef(null);
  const catRef = React.useRef(null);

  React.useEffect(() => {
    if (open) bodyRef.current?.focus();
  }, [open]);

  React.useEffect(() => {
    const h = (e) => { if (catRef.current && !catRef.current.contains(e.target)) setCatOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const reset = () => { setOpen(false); setTitle(""); setBody(""); setCat("general"); };
  const current = MEMO_CATEGORIES.find(c => c.key === cat);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="group w-full flex items-center gap-2.5 h-11 px-3 bg-white rounded-md ring-1 ring-slate-200 hover:ring-primary-300 hover:bg-primary-50/30 transition-colors text-left">
        <span className="inline-flex items-center justify-center size-6 rounded-md bg-slate-100 text-slate-500 group-hover:bg-primary-100 group-hover:text-primary-600 transition-colors">
          <UIcon name="plus" className="size-3.5" strokeWidth={2.25} />
        </span>
        <span className="flex-1 text-sm text-slate-500 group-hover:text-slate-700">새 메모를 추가하세요…</span>
        <span className="flex items-center gap-0.5 text-slate-400">
          <UKbd>⌘</UKbd><UKbd>N</UKbd>
        </span>
      </button>
    );
  }

  return (
    <div className="bg-white rounded-md ring-1 ring-slate-200 shadow-sm overflow-hidden">
      {/* Header strip */}
      <div className="flex items-center justify-between gap-2 pl-3 pr-1.5 py-1.5 border-b border-slate-100">
        <div className="inline-flex items-center gap-2">
          <UAvatar name="홍" size="sm" />
          <span className="text-xs text-slate-500">홍길동(admin2)</span>
        </div>
        <div ref={catRef} className="relative">
          <button onClick={() => setCatOpen(o => !o)} className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md bg-slate-50 ring-1 ring-inset ring-slate-200 hover:bg-slate-100 transition-colors">
            <span className={cx("size-1.5 rounded-full", current.dot)} />
            <span className="text-[11px] text-slate-700 font-medium">{current.label}</span>
            <UIcon name="chevron-down" className="size-3 text-slate-400" />
          </button>
          {catOpen && (
            <div className="absolute right-0 top-full mt-1 z-30 w-36 bg-white rounded-md ring-1 ring-slate-200 shadow-lg p-1">
              {MEMO_CATEGORIES.map(c => (
                <button key={c.key} onClick={() => { setCat(c.key); setCatOpen(false); }}
                  className={cx(
                    "w-full inline-flex items-center gap-2 px-2 py-1.5 rounded text-left",
                    c.key === cat ? "bg-primary-50 text-primary-700" : "text-slate-700 hover:bg-slate-50",
                  )}>
                  <span className={cx("size-1.5 rounded-full", c.dot)} />
                  <span className="flex-1 text-xs">{c.label}</span>
                  {c.key === cat && <UIcon name="check" className="size-3.5" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Inputs */}
      <div className="px-3 pt-2 pb-1">
        <input
          value={title} onChange={e => setTitle(e.target.value)}
          placeholder="제목"
          className="w-full text-[14px] font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal bg-transparent border-0 outline-none focus:ring-0 px-0 py-1"
        />
        <textarea
          ref={bodyRef} value={body} onChange={e => setBody(e.target.value)}
          rows={3} placeholder="고객사 관련 노트를 남겨주세요. @멘션 · #태그 사용 가능."
          className="w-full text-[13px] text-slate-700 placeholder:text-slate-400 bg-transparent border-0 outline-none focus:ring-0 px-0 py-1 resize-none font-sans leading-relaxed"
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 pl-2 pr-2 py-1.5 border-t border-slate-100 bg-slate-50/60">
        <div className="flex items-center gap-0.5">
          <UButton variant="ghost" size="xs" square icon="paperclip" title="파일 첨부" />
          <UButton variant="ghost" size="xs" square icon="at-sign" title="멘션" />
          <UButton variant="ghost" size="xs" square icon="hash" title="태그" />
          <span className="mx-1 w-px h-3.5 bg-slate-200" />
          <UButton variant="ghost" size="xs" square icon="pin" title="상단 고정" />
          <UButton variant="ghost" size="xs" square icon="lock" title="비공개" />
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-slate-400">
            <UKbd>⌘</UKbd><UKbd>↵</UKbd> 등록
          </span>
          <UButton variant="ghost" size="xs" onClick={reset}>취소</UButton>
          <UButton color="primary" variant="solid" size="xs" trailingIcon="arrow-up" disabled={!body.trim() && !title.trim()}>등록</UButton>
        </div>
      </div>
    </div>
  );
}

/* ---------- Memo Panel ---------- */
function MemoPanel({ onClose }) {
  return (
    <aside className="w-[360px] shrink-0 bg-slate-50 rounded-lg p-5 flex flex-col gap-3 self-start sticky top-[88px] max-h-[calc(100vh-110px)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UIcon name="notebook-pen" className="size-4 text-slate-700" />
          <span className="text-sm font-semibold text-slate-900">메모</span>
          <UBadge size="xs" color="neutral" variant="subtle">{MEMOS.length}</UBadge>
        </div>
        <UButton variant="ghost" size="sm" square icon="x" onClick={onClose} />
      </div>

      {/* Composer */}
      <MemoComposer />

      {/* Timeline */}
      <div className="flex-1 overflow-auto scroll-thin">
        {MEMOS.map((m, i) => {
          const dotClass = {
            success:"bg-emerald-500 ring-emerald-500/25",
            primary:"bg-primary-500 ring-primary-500/25",
            warning:"bg-amber-500 ring-amber-500/25",
            neutral:"bg-slate-400 ring-slate-300/40",
          }[m.tone];
          return (
            <div key={i} className="flex gap-3">
              <div className="flex flex-col items-center pt-1">
                <span className={cx("size-2.5 rounded-full ring-4", dotClass)} />
                {i < MEMOS.length - 1 && <span className="flex-1 w-px bg-slate-200 my-1" />}
              </div>
              <div className="flex-1 min-w-0 pb-5">
                <div className="text-[11px] text-slate-400 mb-1">{m.at} · {m.who}</div>
                <div className="text-sm font-semibold text-slate-900 mb-1">{m.title}</div>
                <div className="text-xs text-slate-600 whitespace-pre-line leading-relaxed">{m.body}</div>
              </div>
            </div>
          );
        })}
      </div>

      <UButton variant="outline" icon="plus" className="w-full">전체 메모 보기</UButton>
    </aside>
  );
}

/* ---------- UModal: Permission Change ---------- */
function PermissionModal({ onClose }) {
  const [role, setRole] = React.useState("ops");
  const [reason, setReason] = React.useState("upgrade");
  const roles = [
    { k:"super", label:"슈퍼관리자", desc:"모든 권한 · 결제 포함" },
    { k:"ops",   label:"운영자",     desc:"발송·템플릿 운영" },
    { k:"audit", label:"검수자",     desc:"발송 전 승인 검수" },
    { k:"acct",  label:"회계",       desc:"결제·세금계산서" },
    { k:"cs",    label:"고객지원",   desc:"고객 응대 한정" },
    { k:"sys",   label:"시스템",     desc:"API · 웹훅 자동화" },
    { k:"view",  label:"조회 전용",  desc:"읽기만 가능", paused: true },
  ];
  return (
    <div onClick={onClose} className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-sm flex items-center justify-center p-10">
      <div onClick={e => e.stopPropagation()} className="w-[600px] bg-white rounded-xl shadow-2xl overflow-hidden ring-1 ring-slate-200">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 flex items-start justify-between border-b border-slate-100">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center size-9 rounded-lg bg-primary-50 text-primary-700">
              <UIcon name="settings-2" className="size-4" />
            </span>
            <div>
              <div className="text-base font-semibold text-slate-900">계정 권한 변경</div>
              <div className="text-xs text-slate-500 mt-0.5">변경 즉시 적용되며, 감사 로그에 기록됩니다.</div>
            </div>
          </div>
          <UButton variant="ghost" size="md" square icon="x" onClick={onClose} />
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Target */}
          <div className="rounded-lg ring-1 ring-slate-200 px-4 py-3 flex items-center gap-3">
            <UAvatar name="김영자" size="lg" />
            <div className="flex-1">
              <div className="text-xs text-slate-400">맑은소프트</div>
              <div className="text-sm font-semibold text-slate-900">김영자 <span className="text-slate-500 font-normal">(Oja@chunhyang.co.kr)</span></div>
            </div>
            <UBadge color="primary" variant="subtle">현재: 운영자</UBadge>
          </div>

          {/* Roles */}
          <div className="bg-slate-50 ring-1 ring-slate-100 rounded-lg p-4">
            <div className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              권한 선택
              <UBadge size="xs" color="neutral" variant="subtle">1개 선택</UBadge>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {roles.map(r => (
                <button key={r.k} onClick={() => setRole(r.k)} className={cx(
                  "p-3 rounded-md text-left transition-colors ring-1 ring-inset",
                  role === r.k ? "ring-2 ring-primary-500 bg-primary-50/60" : "ring-slate-200 bg-white hover:bg-slate-50",
                )}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={cx(
                      "inline-flex items-center justify-center size-3.5 rounded-full ring-1.5 ring-inset",
                      role === r.k ? "ring-primary-600" : "ring-slate-300",
                    )}>
                      {role === r.k && <span className="size-1.5 rounded-full bg-primary-600" />}
                    </span>
                    <span className="text-sm font-semibold text-slate-900">{r.label}</span>
                    {r.paused && <UBadge size="xs" color="warning" variant="subtle">중지</UBadge>}
                  </div>
                  <div className="text-[11px] text-slate-500 pl-[22px] leading-tight">{r.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">변경 사유 <span className="text-red-500">*</span></label>
            <USelect value={reason} onChange={setReason} options={[
              { value:"upgrade",   label:"직무 변경 / 권한 상향" },
              { value:"downgrade", label:"직무 변경 / 권한 하향" },
              { value:"leave",     label:"퇴사 처리" },
              { value:"audit",     label:"감사 권고" },
              { value:"etc",       label:"기타" },
            ]} />
            <div className="mt-2">
              <UInput placeholder="사유를 입력하세요." />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50/70 border-t border-slate-100 flex justify-end gap-2">
          <UButton variant="outline" size="lg" onClick={onClose}>취소</UButton>
          <UButton color="primary" variant="solid" size="lg" icon="check" onClick={onClose}>변경 적용</UButton>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { TopBar, PageHeader, InfoCard, UTabs, FilterPanel, AccountsTable, MemoPanel, PermissionModal, TABS, MEMOS, ACCOUNTS });
