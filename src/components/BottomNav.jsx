// src/components/BottomNav.jsx
import { Link, useLocation } from "react-router-dom";

export default function BottomNav({ role, user }) {
  const { pathname } = useLocation();

  const linkClass = (path) =>
    `flex flex-col items-center text-xs ${
      pathname === path
        ? "text-brand-blue-700"
        : "text-text-secondaryLight dark:text-text-secondaryDark"
    }`;

  return (
    <nav
      className="
        fixed bottom-0 inset-x-0
        bg-surface-light dark:bg-surface-dark
        border-t border-border-light dark:border-border-dark
        flex justify-around py-2
      "
    >
      {role === "client" && (
        <>
          <Link to="/" className={linkClass("/")}>
            Rezervacije
          </Link>

          <Link to="/forum" className={linkClass("/forum")}>
            Forum
          </Link>

          <Link
            to={`/profil/${user.uid}`}
            className={linkClass(`/profil/${user.uid}`)}
          >
            Profil
          </Link>
        </>
      )}

      {role === "admin" && (
        <>
          <Link to="/raspored" className={linkClass("/raspored")}>
            Raspored
          </Link>

          <Link to="/klijenti" className={linkClass("/klijenti")}>
            Klijenti
          </Link>

          <Link to="/paketi" className={linkClass("/paketi")}>
            Paketi
          </Link>

          <Link to="/naplate" className={linkClass("/naplate")}>
            Naplate
          </Link>

          <Link to="/forum" className={linkClass("/forum")}>
            Forum
          </Link>
        </>
      )}
    </nav>
  );
}
