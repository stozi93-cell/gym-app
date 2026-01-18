// src/components/AppHeader.jsx
import { signOut } from "firebase/auth";
import { useLocation, matchPath } from "react-router-dom";
import { auth } from "../firebase";
import { Logo } from "./Logo";

const ROOT_ROUTES = [
  "/",
  "/bookings/*",
  "/forum/*",
];

export default function AppHeader({ profile }) {
  const location = useLocation();

  const isRootScreen = ROOT_ROUTES.some(route =>
    matchPath(route, location.pathname)
  );

  return (
    <header
      className="
        flex items-center justify-between
        px-4 py-3
        border-b border-border-light dark:border-border-dark
        bg-surface-light dark:bg-surface-dark
      "
    >
      {/* Logo */}
      <div className="flex items-center">
        <Logo
          variant={isRootScreen ? "full" : "icon"}
          className={isRootScreen ? "h-6" : "h-7"}
        />
      </div>

      {/* Logout */}
      <button
        onClick={() => signOut(auth)}
        className="
          text-sm font-medium
          text-text-secondaryLight dark:text-text-secondaryDark
          hover:text-brand-blue-700
        "
      >
        Odjava
      </button>
    </header>
  );
}
