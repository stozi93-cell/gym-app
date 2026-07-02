export default function TextareaField({
  label,
  value,
  onChange,
  rows = 4,
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-neutral-300">
        {label}
      </label>

      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full resize-none rounded-xl border border-white/10 bg-neutral-950/60 px-4 py-3.5 text-white outline-none transition focus:border-brand-blue-500 focus:bg-neutral-950"
      />
    </div>
  );
}
