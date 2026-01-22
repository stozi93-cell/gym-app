const { onSchedule } = require("firebase-functions/v2/scheduler");
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

async function send(tokens, payload) {
  if (!tokens.length) return;
  await admin.messaging().sendEachForMulticast({
    tokens,
    data: payload,
  });
}

exports.bookingReminder = onSchedule(
  {
    schedule: "every 5 minutes",
    timeZone: "Europe/Belgrade",
  },
  async () => {
    const now = Date.now();

    const snap = await admin.firestore()
      .collection("bookings")
      .get();

    for (const doc of snap.docs) {
      const booking = doc.data();

      if (!booking.slotTimestamp) continue;
      if (booking.reminderSent === true) continue;

      const slotTime = booking.slotTimestamp.toDate().getTime();
      const diffMin = (slotTime - now) / 1000 / 60;

      if (diffMin < 55 || diffMin > 65) continue;

      const tokens = await getUserTokens(booking.userId);
      if (!tokens.length) continue;

      await send(tokens, {
        type: "BOOKING_SOON",
        target: "/",
        title: "⏰ Trening uskoro",
        body: `Vaš trening počinje u ${formatTime(
          booking.slotTimestamp
        )}.`,
      });

      await doc.ref.update({ reminderSent: true });

      console.log("⏰ Reminder sent for booking", doc.id);
    }
  }
);
