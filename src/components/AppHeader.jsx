// src/components/AppHeader.jsx
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { Logo } from "./Logo";

export default function AppHeader({ profile }) {
  return (
    <header
      className="
        flex items-center justify-between
        px-4 py-3
        border-b border-border-light dark:border-border-dark
        bg-surface-light dark:bg-surface-dark
      "
    >
      <div className="h-6">
        <Logo />
      </div>

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
