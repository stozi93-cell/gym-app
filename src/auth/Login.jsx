import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { Logo } from "../components/Logo";
import { Link } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function login() {
    if (!email || !password) {
      alert("Popunite sva polja");
      return;
    }

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 overflow-hidden flex items-center justify-center bg-gradient-to-br from-brand-blue-900 via-brand-blue-700 to-brand-green-900 px-4">
      
      {/* Content wrapper – pulled UP */}
      <div className="flex w-full max-w-md flex-col items-center -mt-10">
        
        {/* Logo */}
        <Logo className="-mb-4 h-40 select-none" />

        {/* Card */}
        <div className="w-full rounded-3xl bg-neutral-900/90 p-8 shadow-2xl backdrop-blur-md">
          
          <h1 className="mb-8 text-center text-3xl font-semibold text-white">
            Prijava
          </h1>

          <div className="space-y-6">
            {/* Email */}
            <div>
              <label className="mb-2 block text-sm text-neutral-300">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vas@email.com"
                className="w-full rounded-2xl border border-neutral-700 bg-black/40 px-5 py-4 text-white placeholder-neutral-500 outline-none transition focus:border-brand-blue-500"
              />
            </div>

            {/* Password */}
            <div>
              <label className="mb-2 block text-sm text-neutral-300">
                Lozinka
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-2xl border border-neutral-700 bg-black/40 px-5 py-4 text-white placeholder-neutral-500 outline-none transition focus:border-brand-blue-500"
              />
            </div>

            {/* Button */}
            <button
              onClick={login}
              disabled={loading}
              className="mt-2 w-full rounded-2xl bg-brand-blue-500 py-4 text-lg font-semibold text-white transition hover:bg-brand-blue-600 active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? "Prijavljivanje..." : "Prijavi se"}
            </button>
          </div>

          {/* Register */}
          <div className="mt-8 text-center text-sm text-neutral-400">
            Nemaš nalog?
            <div className="mt-3">
              <Link
                to="/register"
                className="inline-block rounded-full bg-brand-green-900/50 px-6 py-3 font-medium text-brand-green-300 transition hover:bg-brand-green-900/70"
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
