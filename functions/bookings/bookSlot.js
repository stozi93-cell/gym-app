const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const {
  getCapacity,
  getBelgradeDayKey,
  getWindowTimestamps,
  countBookingsByTimestamp,
  getSlotAvailability,
} = require("./capacity.mjs");

const REGION = "europe-west8";
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

async function handleBookSlot(request) {
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
    let bookingDayRef = null;
    const bookingDayKey = getBelgradeDayKey(timestampMillis);
    // Adjacent slots share this document, including before either slot exists.
    // Reservation documents remain the source of counts, so deletes free space immediately.
    const capacityDayRef = db.doc(`bookingCapacityDays/${bookingDayKey}`);
    await transaction.get(capacityDayRef);

    if (!isAdmin) {
      bookingDayRef = db.doc(`bookingDays/${requestedUserId}_${bookingDayKey}`);
      await transaction.get(bookingDayRef);

      const userBookingsSnap = await transaction.get(
        db.collection("bookings").where("userId", "==", requestedUserId)
      );
      const alreadyBookedThatDay = userBookingsSnap.docs.some((bookingDoc) => {
        const slotTimestamp = bookingDoc.data().slotTimestamp;
        return (
          slotTimestamp &&
          getBelgradeDayKey(slotTimestamp.toMillis()) === bookingDayKey
        );
      });

      if (alreadyBookedThatDay) {
        throw new HttpsError(
          "already-exists",
          "Već imate rezervisan trening za ovaj dan."
        );
      }
    }

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
      if (slotData.timestamp?.toMillis() !== timestampMillis) {
        throw new HttpsError("failed-precondition", "Vreme termina je promenjeno. Osvežite raspored.");
      }
    }

    const matchingSlotIds = new Set(matchingSlotsSnap.docs.map((doc) => doc.id));
    matchingSlotIds.add(slotRef.id);

    const occurrenceBookings = new Map();

    for (const slotId of matchingSlotIds) {
      const bookingSnap = await transaction.get(
        db.collection("bookings").where("slotId", "==", slotId)
      );

      bookingSnap.docs.forEach((doc) => occurrenceBookings.set(doc.id, { id: doc.id, ...doc.data() }));
    }

    const windowTimestamps = getWindowTimestamps(timestampMillis)
      .map((value) => admin.firestore.Timestamp.fromMillis(value));
    const windowSlots = await transaction.get(
      db.collection("slots").where("timestamp", "in", windowTimestamps)
    );
    const windowBookings = new Map(occurrenceBookings);
    const timestampBookings = await transaction.get(
      db.collection("bookings").where("slotTimestamp", "in", windowTimestamps)
    );
    timestampBookings.docs.forEach((doc) => windowBookings.set(doc.id, { id: doc.id, ...doc.data() }));

    const neighborSlotIds = windowSlots.docs.filter((doc) => !matchingSlotIds.has(doc.id)).map((doc) => doc.id);
    for (let index = 0; index < neighborSlotIds.length; index += 10) {
      const neighborBookings = await transaction.get(
        db.collection("bookings").where("slotId", "in", neighborSlotIds.slice(index, index + 10))
      );
      neighborBookings.docs.forEach((doc) => windowBookings.set(doc.id, { id: doc.id, ...doc.data() }));
    }

    const slots = windowSlots.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const counts = countBookingsByTimestamp([...windowBookings.values()], slots);
    const availability = getSlotAvailability({ timestamp, capacity: slotData.capacity }, counts);
    const bookingCount = availability.booked;
    const alreadyBooked = [...windowBookings.values()].some((booking) =>
      booking.userId === requestedUserId && (
        matchingSlotIds.has(booking.slotId) || booking.slotTimestamp?.toMillis() === timestampMillis
      )
    );

    if (alreadyBooked) {
      throw new HttpsError("already-exists", "Klijent je vec rezervisao ovaj termin.");
    }

    const occurrenceLocked =
      slotData.locked === true ||
      matchingSlotsSnap.docs.some((doc) => doc.data().locked === true);

    if (occurrenceLocked && !adminOverride) {
      throw new HttpsError("failed-precondition", "Termin je zakljucan.");
    }

    if (availability.available === 0 && !allowOverbook && !adminOverride) {
      throw new HttpsError("resource-exhausted",
        availability.neighborLimited
          ? "Termin je popunjen zbog rezervacija u susednim terminima. Izaberite drugi termin."
          : "Termin je popunjen."
      );
    }

    const nextBookingCount = bookingCount + 1;

    transaction.set(capacityDayRef, {
      slotTimestamp: timestamp,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

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

    if (bookingDayRef) {
      transaction.set(bookingDayRef, {
        userId: requestedUserId,
        bookingId: bookingRef.id,
        slotTimestamp: timestamp,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    return {
      bookingId: bookingRef.id,
      slotId: slotRef.id,
      overCapacity: nextBookingCount > availability.effectiveCapacity,
    };
  });
}

exports.bookSlot = onCall({ region: REGION }, handleBookSlot);
// Only deploy this endpoint during preview; the existing live endpoint stays unchanged.
exports.bookSlotPreview = onCall({ region: REGION }, handleBookSlot);
