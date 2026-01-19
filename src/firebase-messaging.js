import { getMessaging, getToken, isSupported } from "firebase/messaging";
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
