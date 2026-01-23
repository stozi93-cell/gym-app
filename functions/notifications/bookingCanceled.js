const { onDocumentDeleted } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

const TZ = "Europe/Belgrade";

function formatDateTime(ts) {
  return new Intl.DateTimeFormat("sr-Latn-RS", {
    timeZone: TZ,
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(ts.toDate());
}

/**
 * CLIENT canceled booking → ADMIN notification
 * DATA-ONLY (required for custom SW)
 * REGION-ALIGNED (europe-west8)
 */
exports.bookingCanceledByClient = onDocumentDeleted(
  "bookings/{bookingId}",
  
  async (event) => {
    try {
      const booking = event.data?.data();
      if (!booking || !booking.userId) return;

      const db = admin.firestore();

      const userSnap = await db.doc(`users/${booking.userId}`).get();
      const user = userSnap.exists ? userSnap.data() : {};

      const fullName =
        [user.name, user.surname].filter(Boolean).join(" ") || "Klijent";

      const timeText = booking.slotTimestamp
        ? formatDateTime(booking.slotTimestamp)
        : "nepoznato vreme";

      const adminSnap = await db
        .collection("users")
        .where("role", "==", "admin")
        .get();

      const tokens = adminSnap.docs.flatMap(
        (d) => d.data().fcmTokens || []
      );
      if (!tokens.length) return;

      await admin.messaging().sendEachForMulticast({
        tokens,
        data: {
          type: "BOOKING_CANCELED_BY_CLIENT",
          target: "/raspored",
          title: "❌ Otkazana rezervacija",
          body: `${fullName} je otkazao trening (${timeText}).`,
        },
      });

      console.log("✅ Admin notified: booking canceled by client");
    } catch (err) {
      console.error("❌ bookingCanceledByClient failed", err);
    }
  }
);
