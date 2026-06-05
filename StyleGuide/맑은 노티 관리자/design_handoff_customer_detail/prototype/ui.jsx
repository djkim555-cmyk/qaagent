/* Nuxt UI-flavoured primitives — UButton, UBadge, UInput, USelect, UCheckbox, URadio, UCard, UAvatar */

const cx = (...a) => a.filter(Boolean).join(" ");

/* ---------------- Icon (lucide) ---------------- */
const UIcon = ({ name, className = "size-4", strokeWidth = 1.75, style }) => {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (window.lucide && ref.current) {
      window.lucide.createIcons({ icons: window.lucide.icons, nameAttr: "data-lucide", attrs: { "stroke-width": strokeWidth } });
    }
  });
  return <i ref={ref} data-lucide={name} className={cx("inline-flex shrink-0", className)} style={style} />;
};

/* ---------------- UButton ---------------- */
/* Nuxt UI variants: solid / outline / soft / subtle / ghost / link */
const BTN_SIZE = {
  xs: "h-6 px-2 text-xs gap-1",
  sm: "h-7 px-2.5 text-xs gap-1.5",
  md: "h-8 px-3 text-sm gap-1.5",
  lg: "h-9 px-3.5 text-sm gap-2",
  xl: "h-10 px-4 text-base gap-2",
};
const BTN_SQUARE = { xs:"size-6 p-0", sm:"size-7 p-0", md:"size-8 p-0", lg:"size-9 p-0", xl:"size-10 p-0" };
const BTN_ICON_SIZE = { xs:"size-3", sm:"size-3.5", md:"size-4", lg:"size-4", xl:"size-5" };

const BTN_VARIANTS = {
  primary: {
    solid:   "bg-primary-500 text-white hover:bg-primary-600 focus-visible:ring-2 focus-visible:ring-primary-500/40",
    outline: "ring-1 ring-inset ring-primary-500 text-primary-700 hover:bg-primary-50",
    soft:    "bg-primary-50 text-primary-700 hover:bg-primary-100",
    subtle:  "bg-primary-50 ring-1 ring-inset ring-primary-500/25 text-primary-700 hover:bg-primary-100",
    ghost:   "text-primary-700 hover:bg-primary-50",
    link:    "text-primary-600 hover:text-primary-700 underline-offset-4 hover:underline",
  },
  neutral: {
    solid:   "bg-slate-900 text-white hover:bg-slate-800",
    outline: "bg-white ring-1 ring-inset ring-slate-300 text-slate-700 hover:bg-slate-50",
    soft:    "bg-slate-100 text-slate-700 hover:bg-slate-200",
    subtle:  "bg-slate-50 ring-1 ring-inset ring-slate-200 text-slate-700 hover:bg-slate-100",
    ghost:   "text-slate-700 hover:bg-slate-100",
    link:    "text-slate-700 hover:text-slate-900 underline-offset-4 hover:underline",
  },
  error: {
    solid:   "bg-red-500 text-white hover:bg-red-600",
    outline: "ring-1 ring-inset ring-red-500 text-red-700 hover:bg-red-50",
    soft:    "bg-red-50 text-red-700 hover:bg-red-100",
    ghost:   "text-red-700 hover:bg-red-50",
  },
};

const UButton = ({
  color = "neutral", variant = "outline", size = "md",
  icon, trailingIcon, square = false, loading = false, disabled = false,
  className, children, ...rest
}) => {
  const variants = BTN_VARIANTS[color] || BTN_VARIANTS.neutral;
  const base = "inline-flex items-center justify-center font-medium rounded-md transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer whitespace-nowrap";
  const sz = square ? BTN_SQUARE[size] : BTN_SIZE[size];
  const v = variants[variant] || variants.outline;
  return (
    <button disabled={disabled || loading} className={cx(base, sz, v, className)} {...rest}>
      {loading
        ? <UIcon name="loader-2" className={cx(BTN_ICON_SIZE[size], "animate-spin")} />
        : icon && <UIcon name={icon} className={BTN_ICON_SIZE[size]} />}
      {!square && children}
      {!square && trailingIcon && <UIcon name={trailingIcon} className={BTN_ICON_SIZE[size]} />}
    </button>
  );
};

/* ---------------- UBadge ---------------- */
const BADGE_COLOR = {
  primary: { solid:"bg-primary-500 text-white",                       soft:"bg-primary-50 text-primary-700",  subtle:"bg-primary-50 text-primary-700 ring-1 ring-inset ring-primary-500/20", outline:"text-primary-700 ring-1 ring-inset ring-primary-500/40" },
  neutral: { solid:"bg-slate-700 text-white",                          soft:"bg-slate-100 text-slate-700",     subtle:"bg-slate-50 text-slate-700 ring-1 ring-inset ring-slate-200",          outline:"text-slate-700 ring-1 ring-inset ring-slate-300" },
  success: { solid:"bg-emerald-500 text-white",                        soft:"bg-emerald-50 text-emerald-700",  subtle:"bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-500/20" },
  warning: { solid:"bg-amber-500 text-white",                          soft:"bg-amber-50 text-amber-700",      subtle:"bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-500/20" },
  error:   { solid:"bg-red-500 text-white",                            soft:"bg-red-50 text-red-700",          subtle:"bg-red-50 text-red-700 ring-1 ring-inset ring-red-500/20" },
  info:    { solid:"bg-sky-500 text-white",                            soft:"bg-sky-50 text-sky-700",          subtle:"bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-500/20" },
  indigo:  { solid:"bg-indigo-500 text-white",                         soft:"bg-indigo-50 text-indigo-700",    subtle:"bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-500/20" },
  violet:  { solid:"bg-violet-500 text-white",                         soft:"bg-violet-50 text-violet-700",    subtle:"bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-500/20" },
};
const BADGE_SIZE = { xs:"h-4 px-1.5 text-[10px]", sm:"h-5 px-1.5 text-[11px]", md:"h-5 px-2 text-xs", lg:"h-6 px-2 text-xs" };

const UBadge = ({ color = "primary", variant = "soft", size = "md", icon, className, children }) => {
  const cmap = BADGE_COLOR[color] || BADGE_COLOR.neutral;
  const v = cmap[variant] || cmap.soft;
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-md font-medium leading-none", BADGE_SIZE[size], v, className)}>
      {icon && <UIcon name={icon} className="size-3" />}
      {children}
    </span>
  );
};

/* ---------------- UInput ---------------- */
const UInput = ({ icon, trailingIcon, size = "md", className, inputClassName, ...rest }) => {
  const h = { xs:"h-6 text-xs", sm:"h-7 text-xs", md:"h-8 text-sm", lg:"h-9 text-sm", xl:"h-10 text-base" }[size];
  const px = icon ? "pl-8" : "pl-3";
  const pr = trailingIcon ? "pr-8" : "pr-3";
  return (
    <div className={cx("relative w-full", className)}>
      {icon && <UIcon name={icon} className="size-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />}
      <input
        className={cx(
          "w-full bg-white rounded-md ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 text-slate-900",
          "focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-inset",
          "disabled:bg-slate-50 disabled:text-slate-500",
          h, px, pr, inputClassName,
        )}
        {...rest}
      />
      {trailingIcon && <UIcon name={trailingIcon} className="size-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />}
    </div>
  );
};

/* ---------------- USelect ---------------- */
const USelect = ({ value, onChange, options, placeholder = "선택", size = "md", className, width }) => {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const h = { sm:"h-7 text-xs", md:"h-8 text-sm", lg:"h-9 text-sm" }[size];
  const cur = options.find(o => o.value === value);
  return (
    <div ref={ref} className={cx("relative", className)} style={width ? { width } : undefined}>
      <button onClick={() => setOpen(o => !o)} className={cx(
        "w-full inline-flex items-center justify-between gap-2 rounded-md bg-white ring-1 ring-inset px-3",
        h,
        open ? "ring-2 ring-primary-500" : "ring-slate-200",
      )}>
        <span className={cur ? "text-slate-900" : "text-slate-400"}>{cur ? cur.label : placeholder}</span>
        <UIcon name="chevron-down" className="size-4 text-slate-500" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 left-0 right-0 bg-white rounded-md ring-1 ring-slate-200 shadow-lg p-1 max-h-60 overflow-auto scroll-thin">
          {options.map(o => (
            <button key={o.value}
              onClick={() => { onChange?.(o.value); setOpen(false); }}
              className={cx(
                "w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded text-left text-sm",
                o.value === value ? "bg-primary-50 text-primary-700" : "text-slate-700 hover:bg-slate-50",
              )}>
              <span>{o.label}</span>
              {o.value === value && <UIcon name="check" className="size-4" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/* ---------------- UCheckbox ---------------- */
const UCheckbox = ({ checked, indeterminate, onChange, label, className }) => {
  const ref = React.useRef(null);
  React.useEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminate; }, [indeterminate]);
  return (
    <label className={cx("inline-flex items-center gap-2 cursor-pointer select-none", className)}>
      <span className="relative inline-flex">
        <input ref={ref} type="checkbox" checked={!!checked} onChange={onChange}
          className="peer size-4 rounded ring-1 ring-inset ring-slate-300 text-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-offset-0" />
      </span>
      {label && <span className="text-sm text-slate-700">{label}</span>}
    </label>
  );
};

/* ---------------- URadio ---------------- */
const URadio = ({ checked, onChange, label, description, name, value, className }) => (
  <label className={cx("inline-flex items-start gap-2 cursor-pointer select-none", className)}>
    <span className="relative inline-flex mt-0.5">
      <input type="radio" name={name} checked={checked} value={value} onChange={onChange}
        className="size-4 rounded-full ring-1 ring-inset ring-slate-300 text-primary-500 focus:ring-2 focus:ring-primary-500" />
    </span>
    <span className="flex flex-col">
      {label && <span className="text-sm text-slate-900 font-medium leading-none">{label}</span>}
      {description && <span className="text-xs text-slate-500 mt-1">{description}</span>}
    </span>
  </label>
);

/* ---------------- UCard ---------------- */
const UCard = ({ className, padded = true, children, header, footer }) => (
  <div className={cx("bg-white rounded-lg ring-1 ring-slate-200 divide-y divide-slate-100", className)}>
    {header && <div className={cx(padded && "px-5 py-4")}>{header}</div>}
    <div className={cx(padded && "px-5 py-5")}>{children}</div>
    {footer && <div className={cx(padded && "px-5 py-3", "bg-slate-50/60 rounded-b-lg")}>{footer}</div>}
  </div>
);

/* ---------------- UAvatar ---------------- */
const UAvatar = ({ name = "?", size = "md", color = "slate", className }) => {
  const sizes = { xs:"size-5 text-[10px]", sm:"size-6 text-[11px]", md:"size-7 text-xs", lg:"size-9 text-sm", xl:"size-10 text-sm" };
  // Deterministic color from name
  const palette = ["bg-rose-100 text-rose-700","bg-amber-100 text-amber-700","bg-emerald-100 text-emerald-700","bg-sky-100 text-sky-700","bg-indigo-100 text-indigo-700","bg-violet-100 text-violet-700","bg-slate-100 text-slate-700"];
  const hash = [...name].reduce((a,c) => a + c.charCodeAt(0), 0);
  const c = palette[hash % palette.length];
  return (
    <span className={cx("inline-flex items-center justify-center rounded-full font-semibold", sizes[size], c, className)}>
      {name.charAt(0)}
    </span>
  );
};

/* ---------------- USeparator ---------------- */
const USeparator = ({ vertical, className }) =>
  vertical
    ? <span className={cx("inline-block w-px self-stretch bg-slate-200", className)} />
    : <hr className={cx("border-slate-200 my-0", className)} />;

/* ---------------- UKbd ---------------- */
const UKbd = ({ children }) => (
  <kbd className="inline-flex items-center justify-center h-5 px-1.5 text-[11px] font-mono text-slate-600 bg-slate-50 ring-1 ring-inset ring-slate-200 rounded">{children}</kbd>
);

Object.assign(window, { cx, UIcon, UButton, UBadge, UInput, USelect, UCheckbox, URadio, UCard, UAvatar, USeparator, UKbd });
