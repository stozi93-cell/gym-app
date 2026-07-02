const admin = require("firebase-admin");

const TZ = "Europe/Belgrade";

/* ───────── TIME ───────── */

function formatDateTime(ts) {
  return new Intl.DateTimeFormat("sr-RS", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(ts.toDate());
}

/* ───────── TOKENS ───────── */

async function getUserTokens(uid) {
  const snap = await admin.firestore().doc(`users/${uid}`).get();
  if (!snap.exists()) return [];
  return getTokensFromUserData(snap.data());
}

async function getAdminTokens(type) {
  const snap = await admin
    .firestore()
    .collection("users")
    .where("role", "==", "admin")
    .get();

  return snap.docs.flatMap((d) => getTokensFromUserData(d.data(), type));
}

function notificationAllowed(user, type) {
  if (!type) return true;

  const preferences = user.notificationPreferences || {};
  const aliases = {
    CHAT_MESSAGE: ["MESSAGE_RECEIVED"],
    SUBSCRIPTION_EXPIRY: ["SUBSCRIPTION_ENDING", "SUBSCRIPTION_ENDED"],
  };

  const keys = [type, ...(aliases[type] || [])];
  return !keys.some((key) => preferences[key] === false);
}

function getTokensFromUserData(user = {}, type) {
  if (!notificationAllowed(user, type)) return [];
  return user.fcmTokens || [];
}

/* ───────── SEND ───────── */

async function send(tokens, payload) {
  if (!tokens.length) return;

  return admin.messaging().sendEachForMulticast({
    tokens,
    data: payload,
  });
}

module.exports = {
  formatDateTime,
  getUserTokens,
  getAdminTokens,
  getTokensFromUserData,
  notificationAllowed,
  send,
};
