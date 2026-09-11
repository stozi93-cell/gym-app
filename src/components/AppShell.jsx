import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { useAuth } from "../context/AuthContext";
import BottomNav from "./BottomNav";
import { Logo } from "./Logo";
import { Link, useLocation } from "react-router-dom";
import LogoutIcon from "./icons/LogoutIcon";
import { useEffect } from "react";
import Avatar from "./Avatar";

import {
  getFcmToken,
  listenForForegroundMessages,
} from "../firebase-messaging";
import { saveFcmToken } from "../utils/saveFcmToken";
import { listenForDeliveredMessages } from "../chat/messageTracking";
import AppUpdatePrompt from "./AppUpdatePrompt";
import NotificationPermissionPrompt from "./NotificationPermissionPrompt";

function SettingsIcon({ className }) {
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
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 8.92 4a1.65 1.65 0 0 0 1-1.51V2a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.64 0 1.22.37 1.51 1H21a2 2 0 1 1 0 4h-.09c-.29.63-.87 1-1.51 1z" />
    </svg>
  );
}

export default function AppShell({ children }) {
  const { user, profile } = useAuth();
  const location = useLocation();

  useEffect(() => {
    let unsubscribe = () => {};

    async function setupNotifications() {
      unsubscribe = await listenForForegroundMessages();

      if (Notification.permission !== "granted" || !user?.uid) return;

      const token = await getFcmToken();
      if (token) await saveFcmToken(user.uid, token);
    }

    setupNotifications();

    return () => unsubscribe();
  }, [user?.uid]);

  useEffect(() => {
    return listenForDeliveredMessages(user?.uid);
  }, [user?.uid]);

  const selectedCoachId =
    location.pathname === "/chat"
      ? new URLSearchParams(location.search).get("coach")
      : "";

  // Keep the top bar on the client coach list, but hide it inside chats.
  const isChatPage =
    (location.pathname === "/chat" && !!selectedCoachId) ||
    location.pathname.startsWith("/admin-chat/");
  const isBookingsPage = location.pathname === "/rezervacije";

  return (
    <div
      className="
        app-viewport flex flex-col
        bg-background-dark
        text-text-primaryDark
      "
    >
      <AppUpdatePrompt />
      <NotificationPermissionPrompt userId={user?.uid} />

      {/* TOP BAR (hidden on chat) */}
      {!isChatPage && (
        <header
          className="
            flex h-14 items-center justify-between
            border-b border-white/10
            bg-neutral-950/80 backdrop-blur-xl
            px-3 shadow-[0_10px_28px_rgba(0,0,0,0.28)]
          "
        >
          <Link to="/" className="flex min-w-0 items-center" aria-label="Početna">
            <Logo
              variant="icon"
              className="h-10 w-10"
            />
          </Link>

          <div className="flex items-center gap-1">
            {profile?.role === "admin" && (
              <Link
                to="/profil/me"
                aria-label="Profil"
                className="rounded-full transition hover:ring-2 hover:ring-brand-blue-500"
              >
                <Avatar
                  name={`${profile.name || ""} ${profile.surname || ""}`.trim()}
                  photoURL={profile.photoURL || ""}
                  className="h-8 w-8 text-xs"
                />
              </Link>
            )}
            <Link
              to="/podesavanja"
              aria-label="Podešavanja"
              title="Podešavanja"
              className="
                rounded-full p-2
                text-text-secondaryDark
                transition
                hover:bg-white/5 hover:text-white
              "
            >
              <SettingsIcon className="h-5 w-5" />
            </Link>
            <button
              onClick={() => signOut(auth)}
              aria-label="Odjava"
              className="
                rounded-full p-2
                text-text-secondaryDark
                hover:bg-white/5 hover:text-white
                transition
              "
            >
              <LogoutIcon className="h-5 w-5" />
            </button>
          </div>
        </header>
      )}

      {/* MAIN CONTENT */}
      <main
        className={`min-h-0 flex-1 px-4 py-4 ${
          isBookingsPage
            ? "grid grid-rows-[minmax(0,1fr)] overflow-hidden pb-24"
            : `overflow-y-auto ${isChatPage ? "pb-4" : "pb-24"}`
        }`}
      >
        {children}
      </main>

      {/* BOTTOM NAV */}
      {!isChatPage && <BottomNav role={profile?.role} />}
    </div>
  );
}
