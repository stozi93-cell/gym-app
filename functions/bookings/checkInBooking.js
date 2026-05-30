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
    if (booking.checkedIn === true) {
      return { alreadyCheckedIn: true };
    }

    const subscriptionSnap = await transaction.get(
      db.collection("clientSubscriptions").where("userId", "==", booking.userId)
    );

    const activeSubscription = subscriptionSnap.docs.find(
      (doc) => doc.data().active !== false && doc.data().startDate
    );

    transaction.update(bookingRef, {
      checkedIn: true,
      checkedInAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (activeSubscription) {
      const subscription = activeSubscription.data();
      const slotTimestamp = booking.slotTimestamp;

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

