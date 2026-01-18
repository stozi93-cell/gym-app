// src/components/AppHeader.jsx
import { signOut } from "firebase/auth";
import { useLocation } from "react-router-dom";
import { auth } from "../firebase";
import { Logo } from "./Logo";

export default function AppHeader({ profile }) {
  const { pathname } = useLocation();

  const isRootScreen =
    pathname === "/" ||
    pathname.startsWith("/bookings") ||
    pathname.startsWith("/forum");

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
