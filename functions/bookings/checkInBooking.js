const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

const REGION = "europe-west8";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

exports.checkInBooking = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Morate biti prijavljeni.");
  }

  const bookingId = request.data?.bookingId;
  if (!bookingId) {
    throw new HttpsError("invalid-argument", "Rezervacija nije izabrana.");
  }

  const db = admin.firestore();
  const callerRef = db.doc(`users/${request.auth.uid}`);
  const bookingRef = db.doc(`bookings/${bookingId}`);

  return db.runTransaction(async (transaction) => {
    const callerSnap = await transaction.get(callerRef);
    if (!callerSnap.exists || callerSnap.data().role !== "admin") {
      throw new HttpsError("permission-denied", "Samo admin moze da cekira klijenta.");
    }

    const bookingSnap = await transaction.get(bookingRef);
    if (!bookingSnap.exists) {
      throw new HttpsError("not-found", "Rezervacija vise ne postoji.");
    }

    const booking = bookingSnap.data();
    const clientRef = db.doc(`users/${booking.userId}`);
    if (booking.checkedIn === true) {
      return { alreadyCheckedIn: true };
    }

    const subscriptionSnap = await transaction.get(
      db.collection("clientSubscriptions").where("userId", "==", booking.userId)
    );

    const slotTimestamp = booking.slotTimestamp;
    const matchingSubscriptions = subscriptionSnap.docs
      .filter((doc) => {
        const subscription = doc.data();
        return (
          subscription.active !== false &&
          subscription.startDate &&
          subscription.endDate &&
          slotTimestamp &&
          slotTimestamp.toMillis() >= subscription.startDate.toMillis() &&
          slotTimestamp.toMillis() <= subscription.endDate.toMillis()
        );
      })
      .sort(
        (a, b) =>
          b.data().startDate.toMillis() - a.data().startDate.toMillis()
      );

    const activeSubscription = matchingSubscriptions[0];

    if (matchingSubscriptions.length > 1) {
      console.warn(
        `Multiple active subscriptions overlap for user ${booking.userId}; using ${activeSubscription.id}`
      );
    }

    transaction.update(bookingRef, {
      checkedIn: true,
      checkedInAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    transaction.update(clientRef, {
      lastVisitAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (activeSubscription) {
      const subscription = activeSubscription.data();
      if (slotTimestamp) {
        const weekIndex = Math.floor(
          (slotTimestamp.toMillis() - subscription.startDate.toMillis()) / WEEK_MS
        );

        if (weekIndex >= 0) {
          const checkInsArray = [...(subscription.checkInsArray || [])];
          checkInsArray[weekIndex] = (checkInsArray[weekIndex] || 0) + 1;

          transaction.update(activeSubscription.ref, {
            checkInsArray,
          });
        }
      }
    }

    return { alreadyCheckedIn: false };
  });
});
