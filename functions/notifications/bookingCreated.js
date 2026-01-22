const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

const TZ = "Europe/Belgrade";

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

exports.notifyAdminBookingCreated = onDocumentCreated(
  "bookings/{bookingId}",
  async (event) => {
    const booking = event.data?.data();
    if (!booking || !booking.slotTimestamp) return;

    const adminTokens = await getAdminTokens();
    if (!adminTokens.length) return;

    const timeText = formatDateTime(booking.slotTimestamp);

    await send(adminTokens, {
      type: "NEW_BOOKING",
      target: "/raspored",
      title: "📅 Nova rezervacija",
      body: `Nova rezervacija — ${timeText}`,
    });

    console.log("✅ Admin new booking notification sent");
  }
);
