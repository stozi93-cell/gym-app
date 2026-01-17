import { NavLink } from "react-router-dom";
import { useUnreadCount } from "../chat/useUnreadCount";

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
        <span className="text-xl">{icon}</span>
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

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border-dark bg-surface-dark">
      <div className="flex h-20 items-center justify-around">

        {role === "client" && (
          <>
            <NavItem to="/" label="Rezervacije" icon="📅" />
            <NavItem to="/profil/me" label="Profil" icon="👤" />
            <NavItem to="/forum" label="Forum" icon="💬" />
            <NavItem
              to="/chat"
              label="Poruke"
              icon="💬"
              badge={unread}
            />
          </>
        )}

        {role === "admin" && (
          <>
            <NavItem to="/raspored" label="Raspored" icon="🗓️" />
            <NavItem to="/klijenti" label="Klijenti" icon="👥" />
            <NavItem to="/paketi" label="Paketi" icon="📦" />
            <NavItem to="/naplate" label="Naplate" icon="💳" />
            <NavItem to="/forum" label="Forum" icon="💬" />
            <NavItem
              to="/poruke"
              label="Poruke"
              icon="💬"
              badge={unread}
            />
          </>
        )}

      </div>
    </nav>
  );
}
