import { NavLink } from "react-router-dom";

function NavItem({ to, label, icon }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex flex-col items-center justify-center gap-1 text-xs transition ${
          isActive
            ? "text-brand-blue-500"
            : "text-text-secondaryDark hover:text-white"
        }`
      }
    >
      <span className="text-xl">{icon}</span>
      <span>{label}</span>
    </NavLink>
  );
}

export default function BottomNav({ role }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border-dark bg-surface-dark">
      <div className="flex h-20 items-center justify-around">
        {role === "client" && (
          <>
            <NavItem to="/" label="Rezervacije" icon="📅" />
            <NavItem to="/profil/me" label="Profil" icon="👤" />
            <NavItem to="/forum" label="Forum" icon="💬" />
            <NavItem to="/chat" label="Poruke" icon="💬" />
          </>
        )}

        {role === "admin" && (
          <>
            <NavItem to="/raspored" label="Raspored" icon="🗓️" />
            <NavItem to="/klijenti" label="Klijenti" icon="👥" />
            <NavItem to="/paketi" label="Paketi" icon="📦" />
            <NavItem to="/naplate" label="Naplate" icon="💳" />
            <NavItem to="/forum" label="Forum" icon="💬" />
            <NavItem to="/poruke" label="Poruke" icon="💬" />
          </>
        )}
      </div>
    </nav>
  );
}
