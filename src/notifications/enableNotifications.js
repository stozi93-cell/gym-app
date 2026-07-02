import {
  getFcmToken,
  requestNotificationPermission,
} from "../firebase-messaging";
import { saveFcmToken } from "../utils/saveFcmToken";

export function getNotificationPermissionState() {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export async function enableNotificationsForUser(uid) {
  if (!uid) {
    return { ok: false, reason: "missing-user" };
  }

  const permission = getNotificationPermissionState();
  if (permission === "unsupported") {
    return { ok: false, reason: "unsupported" };
  }

  const granted =
    permission === "granted" || (await requestNotificationPermission());

  if (!granted) {
    return { ok: false, reason: "denied" };
  }

  const token = await getFcmToken();
  if (!token) {
    return { ok: false, reason: "unsupported" };
  }

  await saveFcmToken(uid, token);
  return { ok: true };
}
