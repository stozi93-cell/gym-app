import { signOut } from "firebase/auth";
import { auth } from "../firebase";

export default function AppShell({ children }) {
  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark text-text-primaryLight dark:text-text-primaryDark">
      
      {/* TOP BAR */}
      <header className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 border-b border-border-light dark:border-border-dark bg-white/80 dark:bg-surface-dark/80 backdrop-blur">
        
        {/* Logo */}
        <div className="flex items-center gap-2">
          <img
            src="/brand/icon.png"
            alt="ReMotion"
            className="h-8 w-auto"
          />
          <span className="text-sm font-semibold">ReMotion</span>
        </div>

        {/* Logout */}
        <button
          onClick={() => signOut(auth)}
          className="text-sm text-text-secondaryLight dark:text-text-secondaryDark hover:opacity-80"
        >
          Odjava
        </button>
      </header>

      {/* CONTENT */}
      <main className="px-4 py-4">
        {children}
      </main>
    </div>
  );
}
