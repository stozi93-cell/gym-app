const { onDocumentDeleted } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

const TZ = "Europe/Belgrade";

function formatTime(ts) {
  return new Intl.DateTimeFormat("sr-RS", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  }).format(ts.toDate());
}

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

  return snap.docs.flatMap((d) => d.data().fcmTokens || []);
}

async function send(tokens, payload) {
  if (!tokens.length) return;
  await admin.messaging().sendEachForMulticast({
    tokens,
    data: payload,
  });
}

exports.notifyBookingCanceled = onDocumentDeleted(
  "bookings/{bookingId}",
  async (event) => {
    const booking = event.data?.before?.data();
    if (!booking) return;

    const timeText = booking.slotTimestamp
      ? ` (${formatTime(booking.slotTimestamp)})`
      : "";

    // CLIENT
    const clientTokens = await getUserTokens(booking.userId);

    await send(clientTokens, {
      type: "BOOKING_CANCELED",
      target: "/",
      title: "❌ Rezervacija otkazana",
      body: `Vaša rezervacija${timeText} je otkazana.`,
    });

    // ADMIN
    const adminTokens = await getAdminTokens();

    await send(adminTokens, {
      type: "BOOKING_CANCELED_ADMIN",
      target: "/raspored",
      title: "❌ Otkazana rezervacija",
      body: `Klijent je otkazao rezervaciju${timeText}.`,
    });

    console.log("✅ Booking canceled notifications sent");
  }
);
