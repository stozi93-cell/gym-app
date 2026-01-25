import { NavLink } from "react-router-dom";
import { useUnreadCount } from "../chat/useUnreadCount";

/* ─────────────────────────────
   Icons (inline SVG)
───────────────────────────── */
function CalendarIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      className={className}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function UserIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      className={className}>
      <circle cx="12" cy="7" r="4" />
      <path d="M5.5 21a6.5 6.5 0 0 1 13 0" />
    </svg>
  );
}

function RepeatIcon({ className }) {
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
      <path d="M17 1l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 23l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

function MegaphoneIcon({ className }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 1 1 0-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 0 1-1.44-4.282m3.102.069a18.03 18.03 0 0 1-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 0 1 8.835 2.535M10.34 6.66a23.847 23.847 0 0 0 8.835-2.535m0 0A23.74 23.74 0 0 0 18.795 3m.38 1.125a23.91 23.91 0 0 1 1.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 0 0 1.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 0 1 0 3.46" />
    </svg>
  );
}

function ChatIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      className={className}>
      <path d="M21 15a4 4 0 0 1-4 4H7l-4 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
    </svg>
  );
}

function UsersIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      className={className}>
      <circle cx="9" cy="7" r="4" />
      <circle cx="17" cy="7" r="3" />
      <path d="M3 21a6 6 0 0 1 12 0" />
      <path d="M14 21a5 5 0 0 1 7 0" />
    </svg>
  );
}

function BoxIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      className={className}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    </svg>
  );
}

function CreditCardIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      className={className}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  );
}

function TrainingIcon({ className }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Clipboard */}
      <rect x="9" y="2" width="6" height="4" rx="1" />
      <path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3" />

      {/* Dumbbell */}
      <path d="M8 13h8" />
      <path d="M6 12v2" />
      <path d="M18 12v2" />
    </svg>
  );
}

/* ─────────────────────────────
   Badge
───────────────────────────── */
function Badge({ count }) {
  if (!count) return null;

  return (
    <span className="
      absolute -top-1 -right-2
      min-w-[18px] h-[18px]
      rounded-full
      bg-blue-600
      px-1
      text-[11px]
      font-medium
      text-white
      flex items-center justify-center
    ">
      {count > 9 ? "9+" : count}
    </span>
  );
}

/* ─────────────────────────────
   Nav Item
───────────────────────────── */
function NavItem({ to, label, icon, badge }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `relative flex flex-col items-center justify-center gap-1 text-xs transition ${
          isActive
            ? "text-brand-blue-500"
            : "text-text-secondaryDark hover:text-white"
        }`
      }
    >
      <div className="relative">
        {icon}
        <Badge count={badge} />
      </div>
      <span>{label}</span>
    </NavLink>
  );
}

/* ─────────────────────────────
   Bottom Nav
───────────────────────────── */
export default function BottomNav({ role }) {
  const unread = useUnreadCount();
  const iconClass = "h-6 w-6";

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border-dark bg-surface-dark">
      <div className="flex h-20 items-center justify-around">

        {role === "client" && (
          <>
            <NavItem to="/" label="Rezervacije" icon={<CalendarIcon className={iconClass} />} />
            <NavItem to="/profil/me" label="Profil" icon={<UserIcon className={iconClass} />} />
            <NavItem to="/forum" label="Novosti" icon={<MegaphoneIcon className={iconClass} />} />
            <NavItem
              to="/chat"
              label="Poruke"
              icon={<ChatIcon className={iconClass} />}
              badge={unread}
            />
          </>
        )}

        {role === "admin" && (
          <>
            <NavItem to="/raspored" label="Raspored" icon={<CalendarIcon className={iconClass} />} />
            <NavItem to="/klijenti" label="Klijenti" icon={<UsersIcon className={iconClass} />} />
            <NavItem to="/paketi" label="Paketi" icon={<RepeatIcon className={iconClass} />} />
            <NavItem to="/naplate" label="Naplate" icon={<CreditCardIcon className={iconClass} />} />
            <NavItem to="/forum" label="Novosti" icon={<MegaphoneIcon className={iconClass} />} />
            <NavItem to="/poruke" label="Poruke" icon={<ChatIcon className={iconClass} />} badge={unread} />
            <NavItem to="/treninzi" label="Treninzi" icon={<TrainingIcon className={iconClass} />} />
          </>
        )}

      </div>
    </nav>
  );
}
