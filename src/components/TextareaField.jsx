export default function TextareaField({
  label,
  value,
  onChange,
  rows = 4,
}) {
  return (
    <div>
      <label className="mb-2 block text-sm text-neutral-300">
        {label}
      </label>

      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full resize-none rounded-2xl border border-neutral-700 bg-black/40 px-5 py-4 text-white outline-none focus:border-brand-blue-500"
      />
    </div>
  );
}
