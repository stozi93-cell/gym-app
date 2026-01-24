const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");

const TZ = "Europe/Belgrade";

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysBetween(a, b) {
  const ONE_DAY = 24 * 60 * 60 * 1000;
  return Math.round((b - a) / ONE_DAY);
}

exports.notifySubscriptionExpiry = onSchedule(
  {
    schedule: "0 9 * * *", // every day at 09:00
    timeZone: TZ,
  },
  async () => {
    try {
      const db = admin.firestore();

      const today = startOfDay(new Date());

      const snap = await db
        .collection("clientSubscriptions")
        .where("active", "==", true)
        .get();

      for (const docSnap of snap.docs) {
        const sub = docSnap.data();
        const { userId, endDate, _notified = {} } = sub;

        if (!userId || !endDate) continue;

        const expiry = startOfDay(endDate.toDate());
        const daysLeft = daysBetween(today, expiry);

        // Only notify on 7 days before or day of expiry
        if (daysLeft !== 7 && daysLeft !== 0) continue;
        if (_notified[daysLeft]) continue;

        const userSnap = await db.doc(`users/${userId}`).get();
        if (!userSnap.exists) continue;

        const tokens = userSnap.data().fcmTokens || [];
        if (!tokens.length) continue;

        let title = "";
        let body = "";

        if (daysLeft === 7) {
          title = "Članarina ističe za 7 dana";
          body = "Vaša članarina ističe za 7 dana.";
        }

        if (daysLeft === 0) {
          title = "Članarina je istekla";
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

        await docSnap.ref.update({
          [`_notified.${daysLeft}`]: true,
        });
      }
    } catch (err) {
      console.error("notifySubscriptionExpiry failed", err);
    }
  }
);
