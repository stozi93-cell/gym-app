import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { useAuth } from "../context/AuthContext";
import BottomNav from "./BottomNav";
import { Logo } from "./Logo";
import { useLocation } from "react-router-dom";

export default function AppShell({ children }) {
  const { profile } = useAuth();
  const location = useLocation();

  // Adjust this if your chat route path differs
  const isChatPage =
  location.pathname === "/chat" ||
  location.pathname.startsWith("/admin-chat/");

  return (
    <div
      className="
        flex h-screen flex-col
        bg-gradient-to-br
        from-brand-blue-900
        via-brand-blue-700
        to-brand-green-900
        text-text-primaryDark
      "
    >
      {/* TOP BAR (hidden on chat) */}
      {!isChatPage && (
        <header
          className="
            flex h-14 items-center justify-between
            border-b border-border-dark
            bg-black/20 backdrop-blur-md
            px-4
          "
        >
          <div className="flex items-center gap-2">
            <Logo className="h-8" />
          </div>

          <button
            onClick={() => signOut(auth)}
            className="text-sm text-text-secondaryDark hover:text-white transition"
          >
            Odjava
          </button>
        </header>
      )}

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-y-auto px-4 py-4 pb-24">
        {children}
      </main>

      {/* BOTTOM NAV */}
      <BottomNav role={profile?.role} />
    </div>
  );
}
