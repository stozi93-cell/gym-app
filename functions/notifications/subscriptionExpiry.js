const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");

const TZ = "Europe/Belgrade";

function daysBetween(a, b) {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.floor((b - a) / oneDay);
}

exports.notifySubscriptionExpiry = onSchedule(
  {
    schedule: "0 9 * * *",
    timeZone: TZ,
  },
  async () => {
    try {
      const db = admin.firestore();

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const subsSnap = await db
        .collection("clientSubscriptions")
        .where("active", "==", true)
        .get();

      for (const doc of subsSnap.docs) {
        const sub = doc.data();
        const { userId, expiresAt, _notified = {} } = sub;

        if (!userId || !expiresAt) continue;

        const expiryDate = expiresAt.toDate();
        expiryDate.setHours(0, 0, 0, 0);

        const daysLeft = daysBetween(today, expiryDate);

        // we only care about 7 days before and day of expiry
        if (![7, 0].includes(daysLeft)) continue;
        if (_notified[daysLeft]) continue;

        const userSnap = await db.doc(`users/${userId}`).get();
        if (!userSnap.exists) continue;

        const tokens = userSnap.data().fcmTokens || [];
        if (!tokens.length) continue;

        let title = "";
        let body = "";

        if (daysLeft === 7) {
          title = "⏳ Članarina ističe za 7 dana";
          body = "Vaša članarina ističe za 7 dana.";
        } else if (daysLeft === 0) {
          title = "❌ Članarina je istekla";
          body = "Vaša članarina je istekla.";
        }

        await admin.messaging().sendEachForMulticast({
          tokens,
          data: {
            type: "SUBSCRIPTION_EXPIRY",
            target: "/profil",
            title,
            body,
          },
        });

        await doc.ref.update({
          [`_notified.${daysLeft}`]: true,
        });

        console.log(
          `⏳ Subscription notification sent (${daysLeft} days)`,
          doc.id
        );
      }
    } catch (err) {
      console.error("❌ notifySubscriptionExpiry failed", err);
    }
  }
);
