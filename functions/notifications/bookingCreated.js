const { onDocumentCreated } = require("firebase-functions/v2/firestore");
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
 * CLIENT created booking → ADMIN notification
 * DATA-ONLY (required for custom SW)
 * REGION-ALIGNED (europe-west8)
 */
exports.notifyAdminBookingCreated = onDocumentCreated(
   "bookings/{bookingId}",
  
  async (event) => {
    try {
      const booking = event.data?.data();
      if (!booking || !booking.userId) return;
      if (booking._notified) return;

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
          type: "NEW_BOOKING",
          target: "/raspored",
          title: "📅 Nova rezervacija",
          body: `${fullName} je rezervisao trening (${timeText}).`,
        },
      });

      await event.data.ref.update({ _notified: true });

      console.log("✅ Admin notified: new booking");
    } catch (err) {
      console.error("❌ notifyAdminBookingCreated failed", err);
    }
  }
);
