import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import Avatar from "../components/Avatar";
import { Panel, StatusPill } from "../components/ui/Primitives";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import {
  enableNotificationsForUser,
  getNotificationPermissionState,
} from "../notifications/enableNotifications";
import {
  NOTIFICATION_PREFERENCES,
  normalizeNotificationPreferences,
} from "../notifications/notificationSettings";

export default function Settings() {
  const { user, profile } = useAuth();
  const role = profile?.role;
  const [savedProfile, setSavedProfile] = useState(null);
  const [admins, setAdmins] = useState([]);
  const [savingKey, setSavingKey] = useState("");
  const [permission, setPermission] = useState(() =>
    typeof window === "undefined" ? "unsupported" : getNotificationPermissionState()
  );
  const [status, setStatus] = useState(null);
  const [enableAllFading, setEnableAllFading] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);

  useEffect(() => {
    if (!user?.uid) return undefined;

    return onSnapshot(doc(db, "users", user.uid), (snap) => {
      setSavedProfile(snap.exists() ? snap.data() : null);
    });
  }, [user?.uid]);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, "users"), where("role", "==", "admin")),
      (snap) => {
        setAdmins(
          snap.docs
            .map((admin) => ({ id: admin.id, ...admin.data() }))
            .sort((a, b) =>
              `${a.name || ""} ${a.surname || ""}`.localeCompare(
                `${b.name || ""} ${b.surname || ""}`,
                "sr-Latn-RS"
              )
            )
        );
      }
    );
  }, []);

  useEffect(() => {
    function refreshPermission() {
      setPermission(getNotificationPermissionState());
    }

    window.addEventListener("focus", refreshPermission);
    document.addEventListener("visibilitychange", refreshPermission);

    return () => {
      window.removeEventListener("focus", refreshPermission);
      document.removeEventListener("visibilitychange", refreshPermission);
    };
  }, []);

  const preferences = useMemo(
    () =>
      normalizeNotificationPreferences(
        savedProfile?.notificationPreferences || {},
        role
      ),
    [savedProfile?.notificationPreferences, role]
  );

  const visiblePreferences = NOTIFICATION_PREFERENCES.filter((item) =>
    item.roles.includes(role)
  );

  const activePreferenceCount = visiblePreferences.filter(
    (item) => preferences[item.key] !== false
  ).length;
  const allPreferencesEnabled =
    visiblePreferences.length > 0 &&
    activePreferenceCount === visiblePreferences.length;
  const needsNotificationPermission =
    permission !== "granted" && permission !== "unsupported";
  const showEnableAllButton =
    visiblePreferences.length > 0 &&
    (needsNotificationPermission || !allPreferencesEnabled || enableAllFading);

  const permissionMeta = {
    granted: {
      label: "Uključena",
      tone: "green",
      description: "Dozvola uređaja je uključena.",
    },
    denied: {
      label: "Blokirana",
      tone: "red",
      description: "Dozvola je isključena u podešavanjima browsera ili telefona.",
    },
    default: {
      label: "Nije uključena",
      tone: "amber",
      description: "Dozvola uređaja još nije uključena.",
    },
    unsupported: {
      label: "Nije podržana",
      tone: "red",
      description: "Ovaj browser ili uređaj ne podržava web obaveštenja.",
    },
  }[permission] || {
    label: "Nepoznato",
    tone: "amber",
    description: "Pokušaj ponovo za nekoliko sekundi.",
  };

  function showStatus(type, message) {
    setStatus({ type, message });
    window.setTimeout(() => setStatus(null), 3000);
  }

  async function enableAllNotifications() {
    if (!user?.uid) return;

    setSavingKey("allNotifications");
    try {
      const updates = {};
      visiblePreferences.forEach((item) => {
        updates[`notificationPreferences.${item.key}`] = true;
        (item.aliases || []).forEach((alias) => {
          updates[`notificationPreferences.${alias}`] = true;
        });
      });

      if (Object.keys(updates).length) {
        await updateDoc(doc(db, "users", user.uid), updates);
      }

      let result = { ok: true };
      if (needsNotificationPermission) {
        result = await enableNotificationsForUser(user.uid);
        setPermission(getNotificationPermissionState());
      }

      if (!result.ok) {
        showStatus(
          "error",
          result.reason === "denied"
            ? "Obaveštenja su blokirana u podešavanjima uređaja."
            : "Ovaj uređaj trenutno ne podržava obaveštenja."
        );
        return;
      }

      showStatus("success", "Sva obaveštenja su uključena.");
      setEnableAllFading(true);
      window.setTimeout(() => setEnableAllFading(false), 260);
    } catch (error) {
      console.error("Enable all notifications failed", error);
      showStatus("error", "Obaveštenja nisu uključena. Pokušaj ponovo.");
    } finally {
      setSavingKey("");
    }
  }

  async function togglePreference(item) {
    if (!user?.uid) return;

    const nextValue = !preferences[item.key];
    const updates = {
      [`notificationPreferences.${item.key}`]: nextValue,
    };
    (item.aliases || []).forEach((alias) => {
      updates[`notificationPreferences.${alias}`] = nextValue;
    });

    setSavingKey(item.key);
    try {
      await updateDoc(doc(db, "users", user.uid), updates);
      showStatus("success", "Podešavanja su sačuvana.");
    } catch (error) {
      console.error("Notification preference save failed", error);
      showStatus("error", "Podešavanja nisu sačuvana. Pokušaj ponovo.");
    } finally {
      setSavingKey("");
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      {status && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            status.type === "success"
              ? "border-brand-green-500/20 bg-brand-green-500/10 text-brand-green-300"
              : "border-red-400/20 bg-red-500/10 text-red-300"
          }`}
        >
          {status.message}
        </div>
      )}

      <Panel className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
            Tipovi obaveštenja
          </p>
          <StatusPill tone="neutral">
            {activePreferenceCount}/{visiblePreferences.length}
          </StatusPill>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          <p className="text-xs text-neutral-400">{permissionMeta.description}</p>
          <StatusPill tone={permissionMeta.tone}>
            {permissionMeta.label}
          </StatusPill>
        </div>

        {showEnableAllButton && (
          <button
            type="button"
            onClick={enableAllNotifications}
            disabled={savingKey === "allNotifications"}
            className={`w-full rounded-xl bg-brand-blue-500 px-4 py-3 text-sm font-semibold text-white shadow-glow transition duration-300 hover:bg-brand-blue-600 disabled:opacity-60 ${
              enableAllFading ? "translate-y-1 opacity-0" : "translate-y-0 opacity-100"
            }`}
          >
            {savingKey === "allNotifications"
              ? "Uključivanje..."
              : "Uključi sva obaveštenja"}
          </button>
        )}

        <div className="space-y-2">
          {visiblePreferences.map((item) => (
            <ToggleRow
              key={item.key}
              title={item.label}
              description={item.description}
              checked={preferences[item.key] !== false}
              disabled={savingKey === item.key}
              onChange={() => togglePreference(item)}
            />
          ))}
        </div>
      </Panel>

      <Panel className="p-4">
        <button
          type="button"
          onClick={() => setContactsOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <span className="text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
            Kontakti trenera
          </span>
          <span className="flex items-center gap-2">
            <StatusPill tone="neutral">{admins.length}</StatusPill>
            <span className={`text-sm text-neutral-400 transition-transform ${contactsOpen ? "rotate-180" : ""}`}>
              ˅
            </span>
          </span>
        </button>

        {contactsOpen && (
          <div className="mt-3 space-y-2">
            {admins.map((admin) => (
              <TrainerContact key={admin.id} admin={admin} />
            ))}

            {!admins.length && (
              <p className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-neutral-500">
                Nema upisanih trenera.
              </p>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}

function ToggleRow({ title, description, checked, disabled, onChange }) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3 transition hover:bg-white/[0.07]">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-white">{title}</span>
        <span className="mt-0.5 block text-xs leading-snug text-neutral-400">
          {description}
        </span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="peer sr-only"
      />
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full border transition ${
          checked
            ? "border-brand-blue-500/40 bg-brand-blue-500"
            : "border-white/10 bg-neutral-700"
        } ${disabled ? "opacity-50" : ""}`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition ${
            checked ? "translate-x-5" : ""
          }`}
        />
      </span>
    </label>
  );
}

function TrainerContact({ admin }) {
  const fullName = `${admin.name || ""} ${admin.surname || ""}`.trim();
  const phoneHref = admin.phone ? `tel:${admin.phone.replace(/\s+/g, "")}` : "";

  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3">
      <Avatar
        name={fullName}
        photoURL={admin.photoURL || ""}
        className="h-10 w-10 text-xs"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">
          {fullName || "Trener"}
        </p>
        <p className="truncate text-xs text-neutral-400">
          {admin.phone || "Telefon nije upisan"}
        </p>
      </div>

      <div className="flex shrink-0 gap-1">
        {phoneHref && (
          <a
            href={phoneHref}
            aria-label="Pozovi"
            title="Pozovi"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-neutral-950/60 text-neutral-300 transition hover:bg-white/10 hover:text-white"
          >
            <PhoneIcon className="h-4 w-4" />
          </a>
        )}
      </div>
    </div>
  );
}

function PhoneIcon({ className }) {
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
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.35 1.9.66 2.81a2 2 0 0 1-.45 2.11L8.05 9.91a16 16 0 0 0 6.04 6.04l1.27-1.27a2 2 0 0 1 2.11-.45c.91.31 1.85.53 2.81.66A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}
