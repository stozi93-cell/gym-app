import { useEffect, useState } from "react";
import { APP_VERSION } from "../appVersion";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

export default function AppUpdatePrompt() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    let active = true;

    async function checkForUpdate() {
      try {
        const response = await fetch(`/version.json?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (!response.ok) return;

        const data = await response.json();
        if (active && data.version && data.version !== APP_VERSION) {
          setUpdateAvailable(true);
        }
      } catch (error) {
        console.warn("App update check failed", error);
      }
    }

    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") checkForUpdate();
    };

    checkForUpdate();
    window.addEventListener("focus", checkForUpdate);
    document.addEventListener("visibilitychange", checkWhenVisible);
    const interval = window.setInterval(checkForUpdate, CHECK_INTERVAL_MS);

    return () => {
      active = false;
      window.removeEventListener("focus", checkForUpdate);
      document.removeEventListener("visibilitychange", checkWhenVisible);
      window.clearInterval(interval);
    };
  }, []);

  if (!updateAvailable) return null;

  return (
    <div className="fixed inset-x-3 top-3 z-[70] mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-brand-blue-500/25 bg-neutral-950/95 px-4 py-3 text-sm text-neutral-100 shadow-premium backdrop-blur-xl">
      <span>Dostupna je nova verzija aplikacije.</span>
      <button
        onClick={() => window.location.reload()}
        className="shrink-0 rounded-xl bg-brand-blue-500 px-3 py-2 text-xs font-semibold text-white shadow-glow"
      >
        Osveži
      </button>
    </div>
  );
}
