import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { Logo } from "../components/Logo";
import { Link, useNavigate } from "react-router-dom";

import InputField from "../components/InputField";
import TextareaField from "../components/TextareaField";
import StatusBanner from "../components/StatusBanner";

export default function Register() {
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [subStep2, setSubStep2] = useState(1);
  const [loading, setLoading] = useState(false);

  const [status, setStatus] = useState(null);
  const [errors, setErrors] = useState({});

  const [form, setForm] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    ime: "",
    prezime: "",
    telefon: "",
    datumRodjenja: "",
    ciljevi: "",
    zdravstveneNapomene: "",
  });

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: null }));
    setStatus(null);
  }

  function validateStep() {
    const newErrors = {};

    if (step === 1) {
      if (!form.email) newErrors.email = "Email je obavezan";
      if (!form.password) newErrors.password = "Lozinka je obavezna";
      if (!form.confirmPassword)
        newErrors.confirmPassword = "Potvrda lozinke je obavezna";
      if (
        form.password &&
        form.confirmPassword &&
        form.password !== form.confirmPassword
      ) {
        newErrors.confirmPassword = "Lozinke se ne poklapaju";
      }
    }

    if (step === 2 && subStep2 === 1) {
      if (!form.ime) newErrors.ime = "Ime je obavezno";
      if (!form.prezime) newErrors.prezime = "Prezime je obavezno";
    }

    if (step === 2 && subStep2 === 2) {
      if (!form.telefon) newErrors.telefon = "Telefon je obavezan";
      if (!form.datumRodjenja)
        newErrors.datumRodjenja = "Datum rođenja je obavezan";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setStatus({
        type: "error",
        message: "Popuni sva obavezna polja.",
      });
      return false;
    }

    return true;
  }

  function next() {
    if (!validateStep()) return;

    if (step === 2 && subStep2 === 1) {
      setSubStep2(2);
      return;
    }

    setStep((s) => s + 1);
    if (step === 2) setSubStep2(1);
  }

  function back() {
    setStatus(null);

    if (step === 2 && subStep2 === 2) {
      setSubStep2(1);
      return;
    }

    setStep((s) => s - 1);
  }

  async function submitRegister() {
    setLoading(true);
    setStatus(null);

    try {
      const cred = await createUserWithEmailAndPassword(
        auth,
        form.email.trim().toLowerCase(),
        form.password
      );

      await setDoc(
        doc(db, "users", cred.user.uid),
        {
          name: form.ime || "",
          surname: form.prezime || "",
          phone: form.telefon || "",
          dob: form.datumRodjenja ? new Date(form.datumRodjenja) : null,
          goals: form.ciljevi || "",
          healthNotes: form.zdravstveneNapomene || "",
          email: form.email.trim().toLowerCase(),
        },
        { merge: true }
      );

      setStatus({
        type: "success",
        message: "Registracija uspešna 🎉",
      });

      setTimeout(() => {
        navigate("/profil");
      }, 800);
    } catch (err) {
      console.error("REGISTER ERROR:", err);
      setStatus({
        type: "error",
        message: "Došlo je do greške. Pokušaj ponovo.",
      });
    } finally {
      setLoading(false);
    }
  }

  const progress = (step / 4) * 100;

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden bg-gradient-to-br from-brand-blue-900 via-brand-blue-700 to-brand-green-900 px-4">
      <div className="w-full max-w-md rounded-3xl bg-neutral-900/90 p-6 shadow-2xl backdrop-blur-md">

        {/* Logo */}
        <div className="flex justify-center">
          <Logo className="h-24 select-none" />
        </div>

        {/* Progress */}
        <div className="mt-4 h-1.5 w-full rounded-full bg-neutral-700 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-blue-500 to-brand-green-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>

        <p className="mt-3 text-center text-xs text-neutral-400">
          Korak {step} / 4
        </p>

        {status && <StatusBanner type={status.type} message={status.message} />}

        <div className="mt-6 space-y-6">

          {/* STEP 1 */}
          {step === 1 && (
            <>
              <InputField
                label="Email *"
                type="email"
                value={form.email}
                onChange={(v) => updateField("email", v)}
                error={errors.email}
                placeholder="vas@email.com"
              />

              <InputField
  label="Lozinka *"
  type="password"
  value={form.password}
  onChange={(v) => updateField("password", v)}
  error={errors.password}
  togglePassword
/>

          <InputField
  label="Potvrdi lozinku *"
  type="password"
  value={form.confirmPassword}
  onChange={(v) => updateField("confirmPassword", v)}
  error={errors.confirmPassword}
  togglePassword
/>
            </>
          )}

          {/* STEP 2A */}
          {step === 2 && subStep2 === 1 && (
            <>
              <InputField
                label="Ime *"
                value={form.ime}
                onChange={(v) => updateField("ime", v)}
                error={errors.ime}
              />

              <InputField
                label="Prezime *"
                value={form.prezime}
                onChange={(v) => updateField("prezime", v)}
                error={errors.prezime}
              />
            </>
          )}

          {/* STEP 2B */}
          {step === 2 && subStep2 === 2 && (
            <>
              <InputField
                label="Telefon *"
                value={form.telefon}
                onChange={(v) => updateField("telefon", v)}
                error={errors.telefon}
              />

              <InputField
                label="Datum rođenja *"
                type="date"
                value={form.datumRodjenja}
                onChange={(v) =>
                  updateField("datumRodjenja", v)
                }
                error={errors.datumRodjenja}
              />
            </>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <TextareaField
              label="Koji su tvoji ciljevi u treningu ili rehabilitaciji?"
              value={form.ciljevi}
              onChange={(v) => updateField("ciljevi", v)}
            />
          )}

          {/* STEP 4 */}
          {step === 4 && (
            <TextareaField
              label="Da li imaš povrede, zdravstvene tegobe ili nešto važno što bi trebalo da znamo?"
              value={form.zdravstveneNapomene}
              onChange={(v) =>
                updateField("zdravstveneNapomene", v)
              }
            />
          )}
        </div>

        <div className="mt-8 flex justify-between">
          <button
            onClick={back}
            disabled={step === 1}
            className="rounded-xl bg-neutral-700 px-6 py-3 text-sm text-white disabled:opacity-40"
          >
            ← Nazad
          </button>

          {step < 4 ? (
            <button
              onClick={next}
              className="rounded-xl bg-brand-blue-500 px-6 py-3 text-sm font-semibold text-white"
            >
              Dalje →
            </button>
          ) : (
            <button
              onClick={submitRegister}
              disabled={loading}
              className="rounded-xl bg-brand-blue-500 px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {loading ? "Završavanje..." : "Završi registraciju"}
            </button>
          )}
        </div>

        <div className="mt-6 text-center text-sm text-neutral-400">
          Već imaš nalog?
          <div className="mt-3">
            <Link
              to="/login"
              className="inline-block rounded-full bg-brand-blue-900/40 px-6 py-2.5 text-brand-blue-300"
            >
              Prijavi se
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
