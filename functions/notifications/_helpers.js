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
  return snap.data().fcmTokens || [];
}

async function getAdminTokens() {
  const snap = await admin
    .firestore()
    .collection("users")
    .where("role", "==", "admin")
    .get();

  return snap.docs.flatMap(d => d.data().fcmTokens || []);
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
  send,
};
