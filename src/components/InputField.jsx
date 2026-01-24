import { useState } from "react";

export default function InputField({
  label,
  type = "text",
  value,
  onChange,
  error,
  placeholder,
  togglePassword = false,
}) {
  const [show, setShow] = useState(false);

  const isPassword = togglePassword && type === "password";

  return (
    <div>
      <label className="mb-2 block text-sm text-neutral-300">
        {label}
      </label>

      <div className="relative">
        <input
          type={isPassword ? (show ? "text" : "password") : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full rounded-2xl border bg-black/40 px-5 py-4 pr-12 text-white placeholder-neutral-500 outline-none transition ${
            error
              ? "border-red-500 focus:border-red-500"
              : "border-neutral-700 focus:border-brand-blue-500"
          }`}
        />

        {isPassword && (
  <button
    type="button"
    onClick={() => setShow((s) => !s)}
    className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white transition"
    aria-label={show ? "Sakrij lozinku" : "Prikaži lozinku"}
  >
    {show ? (
      /* Eye OFF */
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
      >
        <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C7 20 2.73 16.11 1 12c.64-1.5 1.6-2.87 2.82-4.02" />
        <path d="M10.58 10.58A3 3 0 0 0 12 15a3 3 0 0 0 1.42-.36" />
        <path d="M1 1l22 22" />
        <path d="M9.88 5.09A10.94 10.94 0 0 1 12 4c5 0 9.27 3.89 11 8a11.06 11.06 0 0 1-2.1 3.3" />
      </svg>
    ) : (
      /* Eye ON */
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
      >
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    )}
  </button>
)}
      </div>

      {error && (
        <p className="mt-1 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
