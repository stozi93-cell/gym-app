import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { useAuth } from "../context/AuthContext";
import BottomNav from "./BottomNav";
import { Logo } from "./Logo";
import { useLocation } from "react-router-dom";
import LogoutIcon from "./icons/LogoutIcon";
import { useEffect } from "react";

import {
  requestNotificationPermission,
  getFcmToken,
} from "../firebase-messaging";

export default function AppShell({ children }) {
  const { profile } = useAuth();
  const location = useLocation();

  // Chat pages: hide header entirely
  const isChatPage =
    location.pathname === "/chat" ||
    location.pathname.startsWith("/admin-chat/");

  // Full logo on core sections
  const showFullLogo =
    location.pathname === "/" ||
    location.pathname.startsWith("/bookings") ||
    location.pathname.startsWith("/profil") ||
    location.pathname.startsWith("/raspored") ||
    location.pathname.startsWith("/klijenti") ||
    location.pathname.startsWith("/paketi") ||
    location.pathname.startsWith("/naplate") ||
    location.pathname.startsWith("/poruke") ||
    location.pathname.startsWith("/treninzi") ||
    location.pathname.startsWith("/forum");

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
            px-1
          "
        >
          <div className="flex items-center">
            <Logo
              variant={showFullLogo ? "full" : "icon"}
              className={showFullLogo ? "h-20" : "h-16"}
            />
          </div>

          <button
            onClick={() => signOut(auth)}
            aria-label="Odjava"
            className="
              p-2
              text-text-secondaryDark
              hover:text-white
              transition
            "
          >
            <LogoutIcon className="h-5 w-5" />
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
