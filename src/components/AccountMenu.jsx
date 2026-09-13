import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import Avatar from "./Avatar";

const MENU_ITEMS = [
  { to: "/profil/me", label: "Profil", icon: UserIcon },
  { to: "/podesavanja", label: "Podešavanja", icon: SettingsIcon },
  { to: "/pravila-teretane", label: "Pravila teretane", icon: RulesIcon },
  { to: "/uputstvo", label: "Uputstvo za aplikaciju", icon: HelpIcon },
  { to: "/cenovnik", label: "Cenovnik", icon: PriceIcon },
];

export default function AccountMenu({ profile }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const fullName = `${profile?.name || ""} ${profile?.surname || ""}`.trim();

  useEffect(() => {
    if (!open) return undefined;

    function closeOutside(event) {
      if (!menuRef.current?.contains(event.target)) setOpen(false);
    }

    function closeOnEscape(event) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label="Korisnički meni"
        aria-expanded={open}
        className={`rounded-full transition ${
          open ? "ring-2 ring-brand-blue-500" : "hover:ring-2 hover:ring-brand-blue-500/60"
        }`}
      >
        <Avatar
          name={fullName}
          photoURL={profile?.photoURL || ""}
          className="h-9 w-9 text-xs"
        />
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-[70] w-64 overflow-hidden rounded-xl border border-white/10 bg-neutral-900/98 p-1.5 shadow-[0_22px_55px_rgba(0,0,0,0.58)] backdrop-blur-xl">
          <div className="flex items-center gap-3 border-b border-white/10 px-2 py-2.5">
            <Avatar
              name={fullName}
              photoURL={profile?.photoURL || ""}
              className="h-10 w-10 text-xs"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{fullName || "Korisnik"}</p>
              <p className="truncate text-[11px] text-neutral-500">{profile?.email || ""}</p>
            </div>
          </div>

          <div className="py-1">
            {MENU_ITEMS.map(({ to, label, icon }, index) => (
              <div key={to} className={index === 2 ? "mt-1 border-t border-white/10 pt-1" : ""}>
                <NavLink
                  to={to}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                      isActive
                        ? "bg-brand-blue-500/10 text-brand-blue-200"
                        : "text-neutral-200 hover:bg-white/5 hover:text-white"
                    }`
                  }
                >
                  {icon({ className: "h-4.5 w-4.5 shrink-0" })}
                  <span>{label}</span>
                </NavLink>
              </div>
            ))}
          </div>

          <div className="border-t border-white/10 pt-1">
            <button
              type="button"
              onClick={() => signOut(auth)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-red-300 transition hover:bg-red-500/10"
            >
              <LogoutIcon className="h-4.5 w-4.5" />
              <span>Odjava</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function UserIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" className={className}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}

function SettingsIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 13.5v-3l-2-.7a7 7 0 0 0-.7-1.7l.9-1.9-2.1-2.1-1.9.9a7 7 0 0 0-1.7-.7L10.5 2h-3l-.7 2a7 7 0 0 0-1.7.7l-1.9-.9-2.1 2.1.9 1.9a7 7 0 0 0-.7 1.7L0 10.5v3l2 .7a7 7 0 0 0 .7 1.7l-.9 1.9 2.1 2.1 1.9-.9a7 7 0 0 0 1.7.7l.7 2h3l.7-2a7 7 0 0 0 1.7-.7l1.9.9 2.1-2.1-.9-1.9a7 7 0 0 0 .7-1.7L19 13.5Z" transform="translate(2.5 0) scale(.82 1)" />
    </svg>
  );
}

function RulesIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M6 3h12v18H6z" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </svg>
  );
}

function HelpIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.8 9a2.4 2.4 0 1 1 3.5 2.1c-.9.5-1.3 1-1.3 1.9" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function PriceIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 7h16v12H4z" />
      <path d="M8 7V5h8v2M8 13h8M12 10v6" />
    </svg>
  );
}

function LogoutIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M10 4H5v16h5" />
      <path d="M14 8l4 4-4 4M18 12H9" />
    </svg>
  );
}
