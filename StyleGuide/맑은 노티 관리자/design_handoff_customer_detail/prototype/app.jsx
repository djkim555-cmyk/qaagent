/* App shell — wires LNB, TopBar, content, modal, Tweaks */

const DEFAULTS = /*EDITMODE-BEGIN*/{
  "primary": "blue",
  "memoOpen": true,
  "compactSidebar": false,
  "showFilters": true,
  "density": "comfortable"
}/*EDITMODE-END*/;

/* Nuxt UI lets you change the primary color via CSS variables — we override Tailwind's primary palette dynamically */
const PRIMARY_PALETTES = {
  blue:   { 50:"#eff6ff",100:"#dbeafe",200:"#bfdbfe",300:"#93c5fd",400:"#60a5fa",500:"#3b82f6",600:"#2563eb",700:"#1d4ed8",800:"#1e40af",900:"#1e3a8a" },
  indigo: { 50:"#eef2ff",100:"#e0e7ff",200:"#c7d2fe",300:"#a5b4fc",400:"#818cf8",500:"#6366f1",600:"#4f46e5",700:"#4338ca",800:"#3730a3",900:"#312e81" },
  green:  { 50:"#f0fdf4",100:"#dcfce7",200:"#bbf7d0",300:"#86efac",400:"#4ade80",500:"#22c55e",600:"#16a34a",700:"#15803d",800:"#166534",900:"#14532d" },
  rose:   { 50:"#fff1f2",100:"#ffe4e6",200:"#fecdd3",300:"#fda4af",400:"#fb7185",500:"#f43f5e",600:"#e11d48",700:"#be123c",800:"#9f1239",900:"#881337" },
  amber:  { 50:"#fffbeb",100:"#fef3c7",200:"#fde68a",300:"#fcd34d",400:"#fbbf24",500:"#f59e0b",600:"#d97706",700:"#b45309",800:"#92400e",900:"#78350f" },
};

function applyPrimary(name) {
  const p = PRIMARY_PALETTES[name] || PRIMARY_PALETTES.blue;
  if (window.tailwind?.config?.theme?.extend?.colors) {
    window.tailwind.config.theme.extend.colors.primary = { ...p, DEFAULT: p[500] };
  }
  // Force-rebuild by re-injecting a class trigger
  const root = document.documentElement;
  root.style.setProperty("--primary-50", p[50]);
  root.style.setProperty("--primary-100", p[100]);
  root.style.setProperty("--primary-500", p[500]);
  root.style.setProperty("--primary-600", p[600]);
  root.style.setProperty("--primary-700", p[700]);
  // Trigger Tailwind Play CDN re-evaluation
  if (window.tailwind?.refresh) window.tailwind.refresh();
}

function App() {
  const [tw, setTweak] = useTweaks(DEFAULTS);
  const [activeKey, setActiveKey] = React.useState("account");
  const [tab, setTab] = React.useState(TABS[1]);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [memoOpen, setMemoOpen] = React.useState(tw.memoOpen);
  const [sidebarOpen, setSidebarOpen] = React.useState(!tw.compactSidebar);

  React.useEffect(() => setMemoOpen(tw.memoOpen), [tw.memoOpen]);
  React.useEffect(() => setSidebarOpen(!tw.compactSidebar), [tw.compactSidebar]);
  React.useEffect(() => { applyPrimary(tw.primary); }, [tw.primary]);

  // Lucide sweep
  React.useEffect(() => { window.lucide?.createIcons(); });

  const padCls = tw.density === "compact" ? "p-4" : "p-6";

  return (
    <div className="flex min-h-screen bg-slate-50">
      {sidebarOpen && <LNB activeKey={activeKey} onSelect={setActiveKey} />}

      <main className="flex-1 min-w-0 flex flex-col">
        <TopBar
          onToggleSidebar={() => setSidebarOpen(v => !v)}
          onToggleMemo={() => { setMemoOpen(v => !v); setTweak("memoOpen", !memoOpen); }}
        />

        <div className={cx("flex gap-5 items-start", padCls)}>
          <section className="flex-1 min-w-0">
            <PageHeader onOpenChange={() => setModalOpen(true)} />
            <InfoCard />
            <UTabs tabs={TABS} value={tab} onChange={setTab} />
            {tw.showFilters && <FilterPanel />}
            <AccountsTable onChangePermission={() => setModalOpen(true)} />

            {/* secondary row */}
            <div className="mt-5 grid grid-cols-[1.6fr_1fr] gap-5">
              <div className="bg-white rounded-lg ring-1 ring-slate-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-[15px] font-semibold text-slate-900">채널별 발송량</div>
                    <div className="text-xs text-slate-400">2026.08.30 → 2026.09.05</div>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500">
                    {["PUSH","RCS","SMS"].map((c, i) => (
                      <span key={c} className="inline-flex items-center gap-1.5">
                        <span className={cx("size-2 rounded-full", ["bg-indigo-500","bg-primary-500","bg-emerald-500"][i])} />
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
                <BarChart />
                <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-3 gap-3">
                  {[
                    { l:"총 발송", v:"1.24M", chg:"+8.4%", up:true },
                    { l:"실패율",  v:"0.42%", chg:"-0.1%p", up:true },
                    { l:"평균 응답", v:"1.18s", chg:"+0.04s", up:false },
                  ].map(s => (
                    <div key={s.l}>
                      <div className="text-xs text-slate-500">{s.l}</div>
                      <div className="flex items-baseline gap-1.5">
                        <div className="text-lg font-semibold text-slate-900 tabular-nums">{s.v}</div>
                        <span className={cx("text-[11px] font-medium", s.up ? "text-emerald-600" : "text-rose-600")}>{s.chg}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-lg ring-1 ring-slate-200 p-5">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="text-[15px] font-semibold text-slate-900">최근 활동</div>
                    <div className="text-xs text-slate-400">고객사 단위 이벤트</div>
                  </div>
                  <UButton variant="ghost" size="sm" trailingIcon="chevron-right">전체</UButton>
                </div>
                <ActivityList />
              </div>
            </div>
          </section>

          {memoOpen && <MemoPanel onClose={() => { setMemoOpen(false); setTweak("memoOpen", false); }} />}
        </div>
      </main>

      {modalOpen && <PermissionModal onClose={() => setModalOpen(false)} />}

      {/* Tweaks */}
      <TweaksPanel title="Tweaks">
        <TweakSection label="레이아웃">
          <TweakToggle id="compactSidebar" label="사이드바 접기" value={tw.compactSidebar} onChange={v => setTweak("compactSidebar", v)} />
          <TweakToggle id="memoOpen" label="메모 패널 표시" value={tw.memoOpen} onChange={v => setTweak("memoOpen", v)} />
          <TweakToggle id="showFilters" label="필터 표시" value={tw.showFilters} onChange={v => setTweak("showFilters", v)} />
          <TweakRadio id="density" label="여백" value={tw.density} onChange={v => setTweak("density", v)}
            options={[{value:"comfortable",label:"기본"},{value:"compact",label:"컴팩트"}]} />
        </TweakSection>
        <TweakSection label="Primary color">
          <TweakColor id="primary" label="Primary" value={tw.primary} onChange={v => setTweak("primary", v)}
            options={[
              { value:"blue",   color:"#3b82f6" },
              { value:"indigo", color:"#6366f1" },
              { value:"green",  color:"#22c55e" },
              { value:"rose",   color:"#f43f5e" },
              { value:"amber",  color:"#f59e0b" },
            ]} />
        </TweakSection>
        <TweakSection label="상태">
          <TweakButton onClick={() => setModalOpen(true)} icon="user-cog">권한 변경 모달 열기</TweakButton>
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

/* ---------- Bar Chart (svg-free, pure tailwind) ---------- */
function BarChart() {
  const days = ["월","화","수","목","금","토","일"];
  const data = [
    [42,28,18],[55,32,22],[48,36,26],[62,40,30],[70,45,36],[38,24,14],[30,20,12],
  ];
  const colors = ["bg-indigo-500","bg-primary-500","bg-emerald-500"];
  const max = 110;
  return (
    <div className="relative h-44 flex items-end gap-5 pb-7 px-1">
      <div className="absolute inset-x-0 top-0 bottom-7 flex flex-col justify-between pointer-events-none">
        {[0,1,2,3].map(i => <div key={i} className="border-t border-dashed border-slate-100" />)}
      </div>
      {days.map((d, i) => (
        <div key={d} className="flex-1 flex flex-col items-center gap-1.5 relative h-full">
          <div className="flex items-end gap-0.5 h-[140px]">
            {data[i].map((v, j) => (
              <div key={j} className={cx("w-2.5 rounded-t", colors[j], i === 4 ? "" : "opacity-90")}
                   style={{ height: `${(v/max)*140}px` }} />
            ))}
          </div>
          <span className={cx("absolute bottom-0 text-[11px]", i === 4 ? "text-slate-900 font-semibold" : "text-slate-400")}>{d}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- Activity List ---------- */
function ActivityList() {
  const items = [
    { icon:"key-round",    accent:"primary",  title:"API 키 재발급",                       who:"홍길동",   at:"2분 전" },
    { icon:"send",         accent:"indigo",   title:"PUSH 캠페인 발송 완료",                who:"자동 트리거", at:"12분 전", meta:"82,310건 · 실패 0.3%" },
    { icon:"credit-card",  accent:"emerald",  title:"크레딧 200,000 충전",                  who:"이몽룡",   at:"1시간 전" },
    { icon:"user-plus",    accent:"amber",    title:"계정 추가 — 방자(ops-dev)",            who:"홍길동",   at:"어제" },
    { icon:"file-text",    accent:"slate",    title:"RCS 템플릿 'order_confirm' 승인 대기", who:"RCS Biz",  at:"어제" },
  ];
  const acc = {
    primary: "bg-primary-50 text-primary-600",
    indigo:  "bg-indigo-50 text-indigo-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber:   "bg-amber-50 text-amber-600",
    slate:   "bg-slate-100 text-slate-500",
  };
  return (
    <div className="divide-y divide-slate-100">
      {items.map((it, i) => (
        <div key={i} className="flex gap-3 py-2.5">
          <span className={cx("inline-flex items-center justify-center size-8 rounded-md shrink-0", acc[it.accent])}>
            <UIcon name={it.icon} className="size-4" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-slate-900">{it.title}</div>
            <div className="text-[11px] text-slate-400">
              {it.who} · {it.at}{it.meta ? ` · ${it.meta}` : ""}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("app")).render(<App />);
