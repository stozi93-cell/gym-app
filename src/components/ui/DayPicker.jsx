export function startOfLocalDay(date) {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

export function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function makeDayKey(date) {
  const local = startOfLocalDay(date);
  const year = local.getFullYear();
  const month = String(local.getMonth() + 1).padStart(2, "0");
  const day = String(local.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateFromDayKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function buildDayPickerDays(startDate = new Date(), count = 6) {
  const start = startOfLocalDay(startDate);
  const days = [];
  let offset = 0;

  while (days.length < count) {
    const date = addDays(start, offset);
    offset += 1;
    if (date.getDay() === 0) continue;

    days.push({
      key: makeDayKey(date),
      date,
      weekday: date
        .toLocaleDateString("sr-Latn-RS", { weekday: "short" })
        .replace(".", ""),
      day: date.toLocaleDateString("sr-Latn-RS", { day: "2-digit" }),
    });
  }

  return days;
}

const toneClasses = {
  neutral: "border-white/10 bg-white/5 text-neutral-300",
  blue: "border-brand-blue-500/35 bg-brand-blue-500/10 text-brand-blue-200",
  green: "border-brand-green-500/35 bg-brand-green-500/10 text-brand-green-200",
  red: "border-red-400/35 bg-red-500/10 text-red-200",
};

export default function DayPicker({
  days,
  selectedKey,
  onSelect,
  metaByKey = {},
  className = "",
}) {
  return (
    <div className={`grid grid-cols-6 gap-1.5 ${className}`}>
      {days.map((day) => {
        const active = day.key === selectedKey;
        const meta = metaByKey[day.key] || {};
        const tone = meta.tone || "neutral";

        return (
          <button
            key={day.key}
            type="button"
            onClick={() => onSelect(day.key)}
            className={`min-w-0 rounded-xl border px-1 py-2 text-center transition ${
              active
                ? "border-brand-blue-500 bg-brand-blue-500 text-white shadow-glow"
                : toneClasses[tone] || toneClasses.neutral
            }`}
          >
            <span className="block truncate text-[9px] font-medium uppercase leading-tight opacity-80">
              {meta.today ? "Danas" : day.weekday}
            </span>
            <span className="mt-0.5 block text-sm font-semibold leading-tight">
              {day.day}
            </span>
          </button>
        );
      })}
    </div>
  );
}
