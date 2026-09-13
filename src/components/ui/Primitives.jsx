export function Panel({ children, className = "", ...props }) {
  return (
    <section
      className={`rounded-2xl border border-white/10 bg-neutral-900/80 shadow-premium backdrop-blur-xl ${className}`}
      {...props}
    >
      {children}
    </section>
  );
}

export function SegmentedControl({ options, value, onChange, className = "" }) {
  return (
    <div
      className={`grid overflow-x-auto gap-1 rounded-xl border border-white/10 bg-neutral-950/60 p-1 ${className}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(max-content, 1fr))` }}
    >
      {options.map((option) => {
        const active = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`whitespace-nowrap rounded-lg px-2.5 py-2 text-[11px] font-medium transition sm:text-xs ${
              active
                ? "bg-brand-blue-500 text-white shadow-glow"
                : "text-neutral-300 hover:bg-white/5 hover:text-white"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

const pillStyles = {
  neutral: "border-white/10 bg-white/5 text-neutral-300",
  blue: "border-brand-blue-500/25 bg-brand-blue-500/10 text-brand-blue-300",
  green: "border-brand-green-500/25 bg-brand-green-500/10 text-brand-green-300",
  amber: "border-amber-400/25 bg-amber-400/10 text-amber-200",
  red: "border-red-400/25 bg-red-500/10 text-red-300",
};

export function StatusPill({ tone = "neutral", children, className = "" }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-medium ${
        pillStyles[tone] || pillStyles.neutral
      } ${className}`}
    >
      {children}
    </span>
  );
}

export function IconButton({ children, label, className = "", ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-neutral-300 transition hover:bg-white/10 hover:text-white ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function EmptyState({ title, description = "", className = "" }) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-neutral-900/70 px-4 py-5 text-center ${className}`}
    >
      <p className="text-sm font-medium text-white">{title}</p>
      {description && (
        <p className="mt-1 text-xs leading-relaxed text-neutral-400">
          {description}
        </p>
      )}
    </div>
  );
}
