/* LNB sidebar — Nuxt UI dashboard navigation pattern */

const MENU = [
  { key: "dash",    label: "대시보드",    icon: "layout-dashboard", items: [] },
  { key: "member",  label: "회원/고객사", icon: "users-round", items: [
    { key: "customer", label: "고객사" },
    { key: "account",  label: "계정" },
    { key: "audit",    label: "감사로그", badge: { color: "error", text: "3" } },
    { key: "block",    label: "차단/제재" },
  ]},
  { key: "send",    label: "발송 관리",   icon: "send", items: [
    { key: "push",     label: "PUSH" },
    { key: "rcs",      label: "RCS" },
    { key: "sms",      label: "SMS/LMS" },
    { key: "alimtalk", label: "알림톡" },
    { key: "email",    label: "이메일" },
    { key: "schedule", label: "예약 발송", trailing: "new" },
  ]},
  { key: "tpl",     label: "템플릿",      icon: "file-text", items: [
    { key: "tpl-push", label: "PUSH 템플릿" },
    { key: "tpl-rcs",  label: "RCS 템플릿" },
    { key: "tpl-sms",  label: "SMS 템플릿" },
    { key: "tpl-alim", label: "알림톡 템플릿" },
    { key: "macro",    label: "치환 변수" },
  ]},
  { key: "report",  label: "리포트",      icon: "bar-chart-3", items: [
    { key: "rpt-vol",     label: "발송량 통계" },
    { key: "rpt-fail",    label: "실패율 분석" },
    { key: "rpt-channel", label: "채널별 리포트" },
    { key: "rpt-credit",  label: "크레딧 소진" },
    { key: "rpt-billing", label: "정산 리포트" },
  ]},
  { key: "channel", label: "채널/연동",   icon: "plug", items: [
    { key: "fcm",     label: "FCM" },
    { key: "apns",    label: "APNs" },
    { key: "rcs-biz", label: "RCS Biz Center" },
    { key: "alim-bz", label: "카카오 비즈" },
    { key: "smpp",    label: "SMPP" },
  ]},
  { key: "billing", label: "결제/크레딧", icon: "credit-card", items: [
    { key: "credit-iss", label: "크레딧 발급" },
    { key: "credit-use", label: "사용 내역" },
    { key: "tax",        label: "세금계산서" },
  ]},
  { key: "ops",     label: "운영",        icon: "settings-2", items: [
    { key: "noti",    label: "공지사항" },
    { key: "faq",     label: "FAQ" },
    { key: "inquiry", label: "1:1 문의" },
  ]},
];

/* Single nav item in Nuxt UI's tone — solid pill for active, ghost for idle */
function NavLink({ active, label, icon, depth = 1, badge, trailing, onClick, open }) {
  const isLeaf = depth === 2;
  return (
    <button onClick={onClick} className={cx(
      "group w-full flex items-center gap-2 rounded-md transition-colors text-left",
      isLeaf ? "h-8 pl-9 pr-2 text-[13px]" : "h-9 px-2 text-sm",
      active
        ? "bg-primary-50 text-primary-700 font-semibold"
        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium",
    )}>
      {!isLeaf && (
        <span className={cx(
          "inline-flex items-center justify-center size-6 rounded-md transition-colors shrink-0",
          active ? "bg-primary-100 text-primary-700" : "bg-slate-100 text-slate-500 group-hover:bg-slate-200",
        )}>
          <UIcon name={icon} className="size-4" />
        </span>
      )}
      {isLeaf && (
        <span className={cx(
          "inline-block size-1 rounded-full shrink-0 -ml-2 mr-1",
          active ? "bg-primary-600" : "bg-transparent",
        )} />
      )}
      <span className="flex-1 truncate">{label}</span>
      {badge && <UBadge size="xs" color={badge.color} variant="soft">{badge.text}</UBadge>}
      {trailing === "new" && <UBadge size="xs" color="primary" variant="subtle">NEW</UBadge>}
      {!isLeaf && open !== undefined && (
        <UIcon name="chevron-down" className={cx("size-4 text-slate-400 transition-transform", open && "rotate-180")} />
      )}
    </button>
  );
}

function LNB({ activeKey = "account", onSelect }) {
  const [open, setOpen] = React.useState(() => Object.fromEntries(MENU.map(m => [m.key, true])));
  return (
    <aside className="w-64 shrink-0 h-screen sticky top-0 bg-white border-r border-slate-200 flex flex-col z-20">
      {/* Brand */}
      <div className="h-16 px-4 flex items-center gap-2.5 border-b border-slate-100">
        <span className="inline-flex items-center justify-center size-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-sm shadow-primary-500/30">
          <UIcon name="message-square-dot" className="size-4" strokeWidth={2.25} />
        </span>
        <span className="flex items-baseline gap-1 leading-none">
          <span className="text-[15px] font-bold text-slate-900">맑은</span>
          <span className="text-[15px] font-normal text-slate-600">message</span>
          <span className="text-[12px] font-bold text-primary-700 ml-0.5 tracking-tight">Admin</span>
        </span>
      </div>

      {/* Search */}
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <UIcon name="search" className="size-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input placeholder="메뉴 검색" className="w-full h-9 pl-8 pr-12 text-sm bg-slate-50 ring-1 ring-inset ring-slate-100 rounded-md placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500" />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
            <UKbd>⌘</UKbd><UKbd>K</UKbd>
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-auto px-3 pb-6 pt-1 scroll-thin space-y-0.5">
        {MENU.map(group => (
          <div key={group.key}>
            <NavLink label={group.label} icon={group.icon}
              open={open[group.key]}
              onClick={() => setOpen(o => ({ ...o, [group.key]: !o[group.key] }))} />
            {open[group.key] && group.items.length > 0 && (
              <div className="space-y-0.5 mt-0.5 mb-1.5">
                {group.items.map(it => (
                  <NavLink key={it.key} depth={2} label={it.label}
                    active={activeKey === it.key}
                    badge={it.badge} trailing={it.trailing}
                    onClick={() => onSelect?.(it.key)} />
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* Footer banner */}
      <div className="m-3 mt-1 p-3 rounded-lg bg-gradient-to-br from-slate-900 to-slate-700 text-white shadow-sm">
        <div className="flex items-start gap-2 mb-2">
          <UIcon name="sparkles" className="size-4 text-amber-300 mt-0.5" />
          <div className="text-[13px] font-semibold leading-snug">AI 발송 도우미 베타</div>
        </div>
        <div className="text-[11px] text-slate-300 leading-relaxed mb-2.5">대상자 추천과 문구 생성을 자동화하세요.</div>
        <button className="w-full h-7 rounded-md bg-white/10 hover:bg-white/15 text-[12px] font-medium inline-flex items-center justify-center gap-1.5 transition-colors">
          베타 신청
          <UIcon name="arrow-right" className="size-3.5" />
        </button>
      </div>

      {/* User chip */}
      <div className="px-3 pb-3 pt-1 border-t border-slate-100 flex items-center gap-2.5">
        <UAvatar name="홍" size="md" />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-slate-900 truncate">홍길동</div>
          <div className="text-[11px] text-slate-500 truncate">admin2 · 슈퍼관리자</div>
        </div>
        <UButton variant="ghost" size="sm" square icon="log-out" />
      </div>
    </aside>
  );
}

Object.assign(window, { LNB, MENU });
