import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import InputField from "../components/InputField";
import { Logo } from "../components/Logo";
import ScrollArea from "../components/ui/ScrollArea";
import StatusBanner from "../components/StatusBanner";
import TextareaField from "../components/TextareaField";
import { auth, db } from "../firebase";

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
      if (!form.confirmPassword) {
        newErrors.confirmPassword = "Potvrda lozinke je obavezna";
      }
      if (
        form.password &&
        form.confirmPassword &&
        form.password !== form.confirmPassword
      ) {
        newErrors.confirmPassword = "Lozinke se ne poklapaju";
      }
      if (form.password && form.password.length < 6) {
        newErrors.password = "Lozinka mora imati bar 6 karaktera";
      }
    }

    if (step === 2 && subStep2 === 1) {
      if (!form.ime) newErrors.ime = "Ime je obavezno";
      if (!form.prezime) newErrors.prezime = "Prezime je obavezno";
    }

    if (step === 2 && subStep2 === 2) {
      if (!form.telefon) newErrors.telefon = "Telefon je obavezan";
      if (!form.datumRodjenja) {
        newErrors.datumRodjenja = "Datum rođenja je obavezan";
      }
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

    setStep((current) => current + 1);
    if (step === 2) setSubStep2(1);
  }

  function back() {
    setStatus(null);

    if (step === 2 && subStep2 === 2) {
      setSubStep2(1);
      return;
    }

    setStep((current) => current - 1);
  }

  async function submitRegister() {
    if (!validateStep()) return;

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
        message: "Registracija je uspešna.",
      });

      setTimeout(() => {
        navigate("/profil/me");
      }, 800);
    } catch (error) {
      console.error("REGISTER ERROR:", error);
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
    <div className="fixed inset-0 bg-background-dark">
      <ScrollArea containerClassName="h-full" className="h-full px-4">
      <div className="flex min-h-full items-center justify-center py-6">
      <div className="flex w-full max-w-md flex-col items-center">
        <Logo
          variant="full"
          className="mb-5 h-24 w-72 max-w-full select-none sm:h-28 sm:w-80"
        />

        <div className="w-full rounded-2xl border border-white/10 bg-neutral-900/80 p-6 shadow-premium backdrop-blur-xl">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
            <div
              className="h-full rounded-full bg-brand-blue-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>

          <p className="mt-3 text-center text-xs text-neutral-400">
            Korak {step} / 4
          </p>

          <StatusBanner {...status} />

          <div className="mt-6 space-y-5">
            {step === 1 && (
              <>
                <InputField
                  label="Email *"
                  type="email"
                  value={form.email}
                  onChange={(value) => updateField("email", value)}
                  error={errors.email}
                  placeholder="vas@email.com"
                />

                <InputField
                  label="Lozinka *"
                  type="password"
                  value={form.password}
                  onChange={(value) => updateField("password", value)}
                  error={errors.password}
                  togglePassword
                />

                <InputField
                  label="Potvrdi lozinku *"
                  type="password"
                  value={form.confirmPassword}
                  onChange={(value) => updateField("confirmPassword", value)}
                  error={errors.confirmPassword}
                  togglePassword
                />
              </>
            )}

            {step === 2 && subStep2 === 1 && (
              <>
                <InputField
                  label="Ime *"
                  value={form.ime}
                  onChange={(value) => updateField("ime", value)}
                  error={errors.ime}
                />

                <InputField
                  label="Prezime *"
                  value={form.prezime}
                  onChange={(value) => updateField("prezime", value)}
                  error={errors.prezime}
                />
              </>
            )}

            {step === 2 && subStep2 === 2 && (
              <>
                <InputField
                  label="Telefon *"
                  value={form.telefon}
                  onChange={(value) => updateField("telefon", value)}
                  error={errors.telefon}
                />

                <InputField
                  label="Datum rođenja *"
                  type="date"
                  value={form.datumRodjenja}
                  onChange={(value) => updateField("datumRodjenja", value)}
                  error={errors.datumRodjenja}
                />
              </>
            )}

            {step === 3 && (
              <TextareaField
                label="Koji su tvoji ciljevi u treningu ili rehabilitaciji?"
                value={form.ciljevi}
                onChange={(value) => updateField("ciljevi", value)}
              />
            )}

            {step === 4 && (
              <TextareaField
                label="Da li imaš povrede, zdravstvene tegobe ili nešto važno što bi trebalo da znamo?"
                value={form.zdravstveneNapomene}
                onChange={(value) => updateField("zdravstveneNapomene", value)}
              />
            )}
          </div>

          <div className="mt-8 grid grid-cols-2 gap-3">
            <button
              onClick={back}
              disabled={step === 1}
              className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-neutral-200 transition hover:bg-white/10 disabled:opacity-40"
            >
              Nazad
            </button>

            {step < 4 ? (
              <button
                onClick={next}
                className="rounded-xl bg-brand-blue-500 px-6 py-3 text-sm font-semibold text-white shadow-glow transition hover:bg-brand-blue-600"
              >
                Dalje
              </button>
            ) : (
              <button
                onClick={submitRegister}
                disabled={loading}
                className="rounded-xl bg-brand-blue-500 px-6 py-3 text-sm font-semibold text-white shadow-glow transition hover:bg-brand-blue-600 disabled:opacity-60"
              >
                {loading ? "Završavanje..." : "Završi"}
              </button>
            )}
          </div>

          <div className="mt-6 text-center text-sm text-neutral-400">
            Već imaš nalog?
            <div className="mt-3">
              <Link
                to="/login"
                className="inline-block rounded-full border border-brand-blue-500/25 bg-brand-blue-500/10 px-6 py-2.5 text-brand-blue-300 transition hover:bg-brand-blue-500/15"
              >
                Prijavi se
              </Link>
            </div>
          </div>
        </div>
      </div>
      </div>
      </ScrollArea>
    </div>
  );
}
