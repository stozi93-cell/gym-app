import { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { auth, db } from "../firebase";
import { Logo } from "../components/Logo";
import { Link } from "react-router-dom";

export default function Register() {
  const [step, setStep] = useState(1);

  // Required
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");

  // Optional
  const [goals, setGoals] = useState("");
  const [healthNotes, setHealthNotes] = useState("");

  const [loading, setLoading] = useState(false);

  function nextStep() {
    setStep((s) => Math.min(s + 1, 4));
  }

  function prevStep() {
    setStep((s) => Math.max(s - 1, 1));
  }

  async function register() {
    if (!email || !password || !name || !surname || !phone || !dob) {
      alert("Popunite sva obavezna polja");
      return;
    }

    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);

      await setDoc(doc(db, "users", cred.user.uid), {
        name,
        surname,
        email,
        phone,
        dob: Timestamp.fromDate(new Date(dob)),
        role: "client",
        active: true,
        goals: goals || "",
        healthNotes: healthNotes || "",
        createdAt: Timestamp.fromDate(new Date()),
      });
    } catch (err) {
      console.error(err);
      alert("Greška pri registraciji");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 overflow-y-auto bg-gradient-to-br from-brand-blue-900 via-brand-blue-700 to-brand-green-900 px-4 py-10">
      <div className="mx-auto flex w-full max-w-md flex-col items-center">
        {/* Logo */}
        <Logo className="-mb-4 h-40 select-none" />

        {/* Card */}
        <div className="w-full rounded-3xl bg-neutral-900/90 p-8 shadow-2xl backdrop-blur-md">
          {/* Step indicator */}
          <div className="mb-6 text-center text-sm text-neutral-400">
            Korak {step} / 4
          </div>

          <h1 className="mb-8 text-center text-3xl font-semibold text-white">
            Registracija
          </h1>

          {/* STEP 1 — Account */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <label className="mb-2 block text-sm text-neutral-300">
                  Email *
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-2xl border border-neutral-700 bg-black/40 px-5 py-4 text-white outline-none focus:border-brand-blue-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-neutral-300">
                  Lozinka *
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-2xl border border-neutral-700 bg-black/40 px-5 py-4 text-white outline-none focus:border-brand-blue-500"
                />
              </div>

              <button
                onClick={nextStep}
                className="w-full rounded-2xl bg-brand-blue-500 py-4 text-lg font-semibold text-white transition hover:bg-brand-blue-600"
              >
                Dalje →
              </button>
            </div>
          )}

          {/* STEP 2 — Personal */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <label className="mb-2 block text-sm text-neutral-300">
                  Ime *
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-2xl border border-neutral-700 bg-black/40 px-5 py-4 text-white outline-none focus:border-brand-blue-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-neutral-300">
                  Prezime *
                </label>
                <input
                  value={surname}
                  onChange={(e) => setSurname(e.target.value)}
                  className="w-full rounded-2xl border border-neutral-700 bg-black/40 px-5 py-4 text-white outline-none focus:border-brand-blue-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-neutral-300">
                  Telefon *
                </label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-2xl border border-neutral-700 bg-black/40 px-5 py-4 text-white outline-none focus:border-brand-blue-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-neutral-300">
                  Datum rođenja *
                </label>
                <input
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  className="w-full rounded-2xl border border-neutral-700 bg-black/40 px-5 py-4 text-white outline-none focus:border-brand-blue-500"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={prevStep}
                  className="w-full rounded-2xl bg-neutral-700 py-3 text-white"
                >
                  ← Nazad
                </button>
                <button
                  onClick={nextStep}
                  className="w-full rounded-2xl bg-brand-blue-500 py-3 text-white"
                >
                  Dalje →
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 — Goals */}
          {step === 3 && (
            <div className="space-y-6">
              <p className="text-neutral-300 text-sm">
                Koji su tvoji ciljevi u treningu ili rehabilitaciji?
              </p>

              <textarea
                value={goals}
                onChange={(e) => setGoals(e.target.value)}
                rows={4}
                className="w-full rounded-2xl border border-neutral-700 bg-black/40 px-5 py-4 text-white outline-none focus:border-brand-blue-500"
              />

              <div className="flex gap-3">
                <button
                  onClick={prevStep}
                  className="w-full rounded-2xl bg-neutral-700 py-3 text-white"
                >
                  ← Nazad
                </button>
                <button
                  onClick={nextStep}
                  className="w-full rounded-2xl bg-brand-blue-500 py-3 text-white"
                >
                  Dalje →
                </button>
              </div>
            </div>
          )}

          {/* STEP 4 — Health */}
          {step === 4 && (
            <div className="space-y-6">
              <p className="text-neutral-300 text-sm">
                Da li imaš povrede, zdravstvene tegobe ili nešto što bi trebalo da znamo?
              </p>

              <textarea
                value={healthNotes}
                onChange={(e) => setHealthNotes(e.target.value)}
                rows={4}
                className="w-full rounded-2xl border border-neutral-700 bg-black/40 px-5 py-4 text-white outline-none focus:border-brand-blue-500"
              />

              <div className="flex gap-3">
                <button
                  onClick={prevStep}
                  className="w-full rounded-2xl bg-neutral-700 py-3 text-white"
                >
                  ← Nazad
                </button>
                <button
                  onClick={register}
                  disabled={loading}
                  className="w-full rounded-2xl bg-brand-green-600 py-3 text-white font-semibold transition hover:bg-brand-green-700 disabled:opacity-50"
                >
                  {loading ? "Registracija..." : "Registruj se"}
                </button>
              </div>
            </div>
          )}

          {/* Back to login */}
          <div className="mt-10 text-center text-sm text-neutral-400">
            Već imaš nalog?
            <div className="mt-3">
              <Link
                to="/login"
                className="inline-block rounded-full bg-brand-blue-900/50 px-6 py-3 font-medium text-brand-blue-300 transition hover:bg-brand-blue-900/70"
              >
                Prijavi se
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
