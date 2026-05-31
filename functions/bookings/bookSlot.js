const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

const REGION = "europe-west8";
const DEFAULT_CAPACITY = 5;
const BOOKING_CUTOFF_HOURS = 1;
const WEEKDAYS = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function getCapacity(value) {
  const capacity = Number(value);
  return Number.isFinite(capacity) && capacity > 0
    ? capacity
    : DEFAULT_CAPACITY;
}

function templateSlotId(templateId, timestampMillis) {
  return `tpl_${templateId}_${timestampMillis}`;
}

function parseTimestampMillis(value) {
  const timestampMillis = Number(value);
  if (!Number.isFinite(timestampMillis)) {
    throw new HttpsError("invalid-argument", "Termin nema ispravno vreme.");
  }
  return timestampMillis;
}

function isTemplateOccurrence(template, timestampMillis) {
  const date = new Date(timestampMillis);
  if (date.getSeconds() !== 0 || date.getMilliseconds() !== 0) return false;

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Belgrade",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return (
    Array.isArray(template.days) &&
    template.days.includes(WEEKDAYS[parts.weekday]) &&
    template.time === `${parts.hour}:${parts.minute}`
  );
}

exports.bookSlot = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Morate biti prijavljeni.");
  }

  const db = admin.firestore();
  const callerId = request.auth.uid;
  const requestedUserId = request.data?.userId || callerId;
  const sourceTemplateId = request.data?.templateId || null;
  const requestedSlotId = request.data?.slotId || null;
  const allowOverbook = request.data?.allowOverbook === true;
  const adminOverride = request.data?.adminOverride === true;
  const timestampMillis = parseTimestampMillis(request.data?.timestampMillis);
  const timestamp = admin.firestore.Timestamp.fromMillis(timestampMillis);

  return db.runTransaction(async (transaction) => {
    const callerRef = db.doc(`users/${callerId}`);
    const callerSnap = await transaction.get(callerRef);
    const isAdmin = callerSnap.exists && callerSnap.data().role === "admin";

    if (requestedUserId !== callerId && !isAdmin) {
      throw new HttpsError("permission-denied", "Nemate dozvolu za ovu rezervaciju.");
    }

    if (allowOverbook && !isAdmin) {
      throw new HttpsError("permission-denied", "Samo admin moze da dozvoli overbooking.");
    }

    if (adminOverride && !isAdmin) {
      throw new HttpsError("permission-denied", "Samo admin moze da zaobidje ogranicenja termina.");
    }

    if (
      !isAdmin &&
      timestampMillis - Date.now() < BOOKING_CUTOFF_HOURS * 60 * 60 * 1000
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Rezervacija nije moguca manje od 1h pre pocetka treninga."
      );
    }

    let slotRef;
    let slotData;
    let newSlotData = null;
    const matchingSlotsSnap = await transaction.get(
      db.collection("slots").where("timestamp", "==", timestamp)
    );

    if (sourceTemplateId) {
      const templateRef = db.doc(`slotTemplates/${sourceTemplateId}`);
      const templateSnap = await transaction.get(templateRef);

      if (!templateSnap.exists || templateSnap.data().active !== true) {
        throw new HttpsError("failed-precondition", "Ovaj termin vise nije aktivan.");
      }

      if (!isTemplateOccurrence(templateSnap.data(), timestampMillis)) {
        throw new HttpsError("failed-precondition", "Termin ne odgovara sablonu.");
      }

      const canonicalSlotId = templateSlotId(sourceTemplateId, timestampMillis);
      const reusableSlot =
        matchingSlotsSnap.docs.find((doc) => doc.id === canonicalSlotId) ||
        matchingSlotsSnap.docs
          .filter((doc) => doc.data().createdFromTemplate === sourceTemplateId)
          .sort((a, b) => a.id.localeCompare(b.id))[0];

      if (reusableSlot) {
        slotRef = reusableSlot.ref;
        slotData = reusableSlot.data();
      } else {
        slotRef = db.doc(`slots/${canonicalSlotId}`);
        const slotSnap = await transaction.get(slotRef);
        slotData = slotSnap.exists ? slotSnap.data() : {};
        if (!slotSnap.exists) {
          newSlotData = {
            timestamp,
            capacity: getCapacity(templateSnap.data().capacity),
            createdFromTemplate: sourceTemplateId,
            locked: false,
          };
        }
      }

      slotData = {
        ...slotData,
        capacity: getCapacity(templateSnap.data().capacity),
      };
    } else {
      if (!requestedSlotId) {
        throw new HttpsError("invalid-argument", "Termin nije izabran.");
      }

      slotRef = db.doc(`slots/${requestedSlotId}`);
      const slotSnap = await transaction.get(slotRef);

      if (!slotSnap.exists) {
        throw new HttpsError("not-found", "Termin vise ne postoji.");
      }

      slotData = slotSnap.data();
    }

    const matchingSlotIds = new Set(matchingSlotsSnap.docs.map((doc) => doc.id));
    matchingSlotIds.add(slotRef.id);

    let bookingCount = 0;
    let alreadyBooked = false;

    for (const slotId of matchingSlotIds) {
      const bookingSnap = await transaction.get(
        db.collection("bookings").where("slotId", "==", slotId)
      );

      bookingCount += bookingSnap.size;
      alreadyBooked ||= bookingSnap.docs.some(
        (doc) => doc.data().userId === requestedUserId
      );
    }

    if (alreadyBooked) {
      throw new HttpsError("already-exists", "Klijent je vec rezervisao ovaj termin.");
    }

    const occurrenceLocked =
      slotData.locked === true ||
      matchingSlotsSnap.docs.some((doc) => doc.data().locked === true);

    if (occurrenceLocked && !adminOverride) {
      throw new HttpsError("failed-precondition", "Termin je zakljucan.");
    }

    const capacity = getCapacity(slotData.capacity);
    if (bookingCount >= capacity && !allowOverbook && !adminOverride) {
      throw new HttpsError("resource-exhausted", "Termin je popunjen.");
    }

    const nextBookingCount = bookingCount + 1;

    if (newSlotData) {
      transaction.set(slotRef, {
        ...newSlotData,
        bookingCount: nextBookingCount,
      });
    } else {
      transaction.update(slotRef, {
        bookingCount: nextBookingCount,
      });
    }

    const bookingRef = db.collection("bookings").doc();
    transaction.set(bookingRef, {
      slotId: slotRef.id,
      slotTimestamp: timestamp,
      userId: requestedUserId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      checkedIn: false,
    });

    return {
      bookingId: bookingRef.id,
      slotId: slotRef.id,
    };
  });
});
