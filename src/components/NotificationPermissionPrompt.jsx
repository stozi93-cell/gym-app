import { useEffect, useState } from "react";
import { enableNotificationsForUser } from "../notifications/enableNotifications";

function promptStorageKey(uid) {
  return `remotion-notification-prompt-dismissed:${uid}`;
}

export default function NotificationPermissionPrompt({ userId }) {
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!userId || !("Notification" in window)) return undefined;
    if (Notification.permission !== "default") return undefined;
    if (window.localStorage.getItem(promptStorageKey(userId)) === "1") {
      return undefined;
    }

    const timer = window.setTimeout(() => setVisible(true), 700);
    return () => window.clearTimeout(timer);
  }, [userId]);

  function dismiss() {
    if (userId) {
      window.localStorage.setItem(promptStorageKey(userId), "1");
    }
    setVisible(false);
  }

  async function enable() {
    setSaving(true);
    setMessage("");

    const result = await enableNotificationsForUser(userId);
    setSaving(false);

    if (result.ok) {
      setVisible(false);
      return;
    }

    setMessage(
      result.reason === "denied"
        ? "Obaveštenja nisu dozvoljena na ovom uređaju."
        : "Ovaj uređaj trenutno ne podržava obaveštenja."
    );
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-4 top-16 z-[70] mx-auto max-w-md">
      <div className="rounded-2xl border border-brand-blue-500/25 bg-neutral-900/95 p-4 shadow-premium backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-brand-blue-500/25 bg-brand-blue-500/10 text-brand-blue-300">
            <BellIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white">
              Uključi obaveštenja
            </p>
            <p className="mt-1 text-xs leading-relaxed text-neutral-400">
              Dobijaćeš poruke, promene termina i važne novosti bez otvaranja aplikacije.
            </p>
            {message && (
              <p className="mt-2 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {message}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={dismiss}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-neutral-300 transition hover:bg-white/10 hover:text-white"
          >
            Kasnije
          </button>
          <button
            type="button"
            onClick={enable}
            disabled={saving}
            className="rounded-xl bg-brand-blue-500 px-4 py-2 text-xs font-semibold text-white shadow-glow transition hover:bg-brand-blue-600 disabled:opacity-60"
          >
            {saving ? "Uključivanje..." : "Uključi"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BellIcon({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </svg>
  );
}
