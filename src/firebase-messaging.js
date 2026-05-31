import {
  getMessaging,
  getToken,
  isSupported,
  onMessage,
} from "firebase/messaging";
import { app } from "./firebase";

let messaging = null;

async function getMessagingSafe() {
  const supported = await isSupported();
  if (!supported) {
    console.warn("🔕 Firebase Messaging not supported");
    return null;
  }

  if (!messaging) {
    messaging = getMessaging(app);
  }

  return messaging;
}

export async function requestNotificationPermission() {
  if (!("Notification" in window)) return false;

  const permission = await Notification.requestPermission();
  return permission === "granted";
}

export async function getFcmToken() {
  try {
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    if (!vapidKey) return null;

    const messagingInstance = await getMessagingSafe();
    if (!messagingInstance) return null;

    return await getToken(messagingInstance, { vapidKey });
  } catch (err) {
    console.error("❌ FCM token error", err);
    return null;
  }
}

export async function listenForForegroundMessages() {
  const messagingInstance = await getMessagingSafe();
  if (!messagingInstance) return () => {};

  return onMessage(messagingInstance, async (payload) => {
    const registration = await navigator.serviceWorker?.ready;
    if (!registration) return;

    await registration.showNotification(
      payload.data?.title || "Novo obavestenje",
      {
        body: payload.data?.body || "",
        icon: "/assets/brand/icon-192.png?v=2",
        badge: "/assets/brand/notification-badge.png?v=2",
        vibrate: [200, 100, 200],
        data: {
          target: payload.data?.target || "/",
        },
      }
    );
  });
}
