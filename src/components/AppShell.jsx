import { useAuth } from "../context/AuthContext";
import BottomNav from "./BottomNav";
import { Logo } from "./Logo";
import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import AccountMenu from "./AccountMenu";

import {
  getFcmToken,
  listenForForegroundMessages,
} from "../firebase-messaging";
import { saveFcmToken } from "../utils/saveFcmToken";
import { listenForDeliveredMessages } from "../chat/messageTracking";
import AppUpdatePrompt from "./AppUpdatePrompt";
import NotificationPermissionPrompt from "./NotificationPermissionPrompt";

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
            relative z-50 flex h-14 items-center justify-between
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

          <AccountMenu profile={profile} />
        </header>
      )}

      {/* MAIN CONTENT */}
      <main className={`min-h-0 flex-1 overflow-y-auto px-4 py-4 ${isChatPage ? "pb-4" : "pb-24"}`}>
        {children}
      </main>

      {/* BOTTOM NAV */}
      {!isChatPage && <BottomNav role={profile?.role} />}
    </div>
  );
}
