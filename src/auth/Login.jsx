import { useState } from "react";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth } from "../firebase";
import { Logo } from "../components/Logo";
import ScrollArea from "../components/ui/ScrollArea";
import { Link } from "react-router-dom";

import InputField from "../components/InputField";
import StatusBanner from "../components/StatusBanner";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState(null);

  const [forgotMode, setForgotMode] = useState(false);

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

  async function resetPassword() {
    if (!email) {
      setErrors({ email: "Email je obavezan" });
      return;
    }

    setLoading(true);
    setStatus(null);

    try {
      await sendPasswordResetEmail(auth, email);
      setStatus({
        type: "success",
        message:
          "Ako nalog postoji, email za resetovanje lozinke je poslat.",
      });
    } catch {
      // Intentionally generic (security best practice)
      setStatus({
        type: "success",
        message:
          "Ako nalog postoji, email za resetovanje lozinke je poslat.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-background-dark">
      <ScrollArea containerClassName="h-full" className="h-full px-4">
      <div className="flex min-h-full items-center justify-center py-6">
      <div className="flex w-full max-w-md flex-col items-center">
        <Logo variant="full" className="mb-6 h-28 w-80 max-w-full select-none sm:h-32 sm:w-96" />

        <div className="w-full rounded-2xl border border-white/10 bg-neutral-900/80 p-6 shadow-premium backdrop-blur-xl">
          <h1 className="mb-2 text-center text-2xl font-semibold text-white">
            {forgotMode ? "Resetovanje lozinke" : "Prijava"}
          </h1>
          <p className="mb-6 text-center text-sm text-neutral-400">
            {forgotMode
              ? "Vrati pristup svom nalogu."
              : "Dobrodošli nazad u ReMotion."}
          </p>

          <StatusBanner {...status} />

          <div className="space-y-5">
            <InputField
              label="Email"
              type="email"
              value={email}
              onChange={(v) => updateField("email", v)}
              error={errors.email}
              placeholder="vaš@email.com"
            />

            {!forgotMode && (
              <InputField
  label="Lozinka"
  type="password"
  value={password}
  onChange={(v) => updateField("password", v)}
  error={errors.password}
  togglePassword
/>
            )}

            {!forgotMode ? (
              <>
                <button
                  onClick={login}
                  disabled={loading}
                  className="mt-2 w-full rounded-xl bg-brand-blue-500 py-3.5 text-base font-semibold text-white shadow-glow transition hover:bg-brand-blue-600 disabled:opacity-50"
                >
                  {loading ? "Prijavljivanje..." : "Prijavi se"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setForgotMode(true);
                    setStatus(null);
                    setErrors({});
                  }}
                  className="w-full text-sm text-neutral-400 transition hover:text-white"
                >
                  Zaboravio/la si lozinku?
                </button>
              </>
            ) : (
              <>
                <p className="text-center text-sm text-neutral-400">
                  Unesi email adresu i poslaćemo ti link za resetovanje lozinke.
                </p>

                <button
                  onClick={resetPassword}
                  disabled={loading}
                  className="mt-2 w-full rounded-xl bg-brand-blue-500 py-3.5 text-base font-semibold text-white shadow-glow transition hover:bg-brand-blue-600 disabled:opacity-50"
                >
                  {loading ? "Slanje..." : "Pošalji link"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setForgotMode(false);
                    setStatus(null);
                    setErrors({});
                  }}
                  className="w-full text-sm text-neutral-400 transition hover:text-white"
                >
                  Nazad na prijavu
                </button>
              </>
            )}
          </div>

          {!forgotMode && (
            <div className="mt-5 text-center text-sm text-neutral-400">
              Nemaš nalog?
              <div className="mt-3">
                <Link
                  to="/register"
                  className="inline-block rounded-full border border-brand-green-500/25 bg-brand-green-500/10 px-6 py-2.5 font-medium text-brand-green-300 transition hover:bg-brand-green-500/15"
                >
                  Registruj se
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
      </div>
      </ScrollArea>
    </div>
  );
}
