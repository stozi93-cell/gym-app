export default function InputField({
  label,
  type = "text",
  value,
  onChange,
  error,
  placeholder,
}) {
  return (
    <div>
      <label className="mb-2 block text-sm text-neutral-300">
        {label}
      </label>

      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-2xl border bg-black/40 px-5 py-4 text-white placeholder-neutral-500 outline-none transition ${
          error
            ? "border-red-500 focus:border-red-500"
            : "border-neutral-700 focus:border-brand-blue-500"
        }`}
      />

      {error && (
        <p className="mt-1 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
