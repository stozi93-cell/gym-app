import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { Logo } from "../components/Logo";
import { Link } from "react-router-dom";

import InputField from "../components/InputField";
import StatusBanner from "../components/StatusBanner";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState(null);

  function updateField(field, value) {
    if (field === "email") setEmail(value);
    if (field === "password") setPassword(value);

    setErrors((prev) => ({ ...prev, [field]: null }));
    setStatus(null);
  }

  async function login() {
    const newErrors = {};

    if (!email) newErrors.email = "Email je obavezan";
    if (!password) newErrors.password = "Lozinka je obavezna";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setStatus({ type: "error", message: "Popuni sva obavezna polja." });
      return;
    }

    setLoading(true);
    setStatus(null);

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setStatus({ type: "error", message: "Pogrešan email ili lozinka." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-brand-blue-900 via-brand-blue-700 to-brand-green-900 px-4">
      <div className="flex w-full max-w-md flex-col items-center -mt-10">
        <Logo className="-mb-4 h-28 select-none" />

        <div className="w-full rounded-3xl bg-neutral-900/90 p-8 shadow-2xl backdrop-blur-md">
          <h1 className="mb-6 text-center text-3xl font-semibold text-white">
            Prijava
          </h1>

          <StatusBanner {...status} />

          <div className="space-y-6">
            <InputField
              label="Email"
              type="email"
              value={email}
              onChange={(v) => updateField("email", v)}
              error={errors.email}
              placeholder="vaš@email.com"
            />

            <InputField
              label="Lozinka"
              type="password"
              value={password}
              onChange={(v) => updateField("password", v)}
              error={errors.password}
            />

            <button
              onClick={login}
              disabled={loading}
              className="mt-2 w-full rounded-2xl bg-brand-blue-500 py-4 text-lg font-semibold text-white transition hover:bg-brand-blue-600 disabled:opacity-50"
            >
              {loading ? "Prijavljivanje..." : "Prijavi se"}
            </button>
          </div>

          <div className="mt-8 text-center text-sm text-neutral-400">
            Nemaš nalog?
            <div className="mt-3">
              <Link
                to="/register"
                className="inline-block rounded-full bg-brand-green-900/50 px-6 py-3 font-medium text-brand-green-300 hover:bg-brand-green-900/70"
              >
                Registruj se
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
