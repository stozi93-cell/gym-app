const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");

const REGION = "europe-west1";
const RETENTION_DAYS = 14;

async function deleteDocs(docs) {
  if (!docs.length) return;

  const db = admin.firestore();
  const writer = db.bulkWriter();

  docs.forEach((doc) => writer.delete(doc.ref));
  await writer.close();
}

async function markBookingsForSilentDelete(docs) {
  if (!docs.length) return;

  const db = admin.firestore();
  const writer = db.bulkWriter();

  docs.forEach((doc) =>
    writer.update(doc.ref, { _skipCancellationNotification: true })
  );
  await writer.close();
}

exports.cleanupOldBookings = onSchedule(
  {
    schedule: "every day 03:00",
    timeZone: "Europe/Belgrade",
    region: REGION,
  },
  async () => {
    const db = admin.firestore();
    const cutoff = admin.firestore.Timestamp.fromMillis(
      Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
    );

    let removedSlots = 0;
    let removedBookings = 0;

    while (true) {
      const oldSlotsSnap = await db
        .collection("slots")
        .where("timestamp", "<", cutoff)
        .limit(100)
        .get();

      if (oldSlotsSnap.empty) break;

      for (const slotDoc of oldSlotsSnap.docs) {
        const bookingSnap = await db
          .collection("bookings")
          .where("slotId", "==", slotDoc.id)
          .get();

        await markBookingsForSilentDelete(bookingSnap.docs);
        await deleteDocs(bookingSnap.docs);
        removedBookings += bookingSnap.size;
      }

      await deleteDocs(oldSlotsSnap.docs);
      removedSlots += oldSlotsSnap.size;
    }

    while (true) {
      const orphanedOldBookingsSnap = await db
        .collection("bookings")
        .where("slotTimestamp", "<", cutoff)
        .limit(200)
        .get();

      if (orphanedOldBookingsSnap.empty) break;

      await markBookingsForSilentDelete(orphanedOldBookingsSnap.docs);
      await deleteDocs(orphanedOldBookingsSnap.docs);
      removedBookings += orphanedOldBookingsSnap.size;
    }

    console.log(
      `Cleanup complete: removed ${removedSlots} slots and ${removedBookings} bookings.`
    );
  }
);
