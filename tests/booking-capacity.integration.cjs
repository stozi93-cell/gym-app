const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("../functions/node_modules/firebase-admin");

// These tests may only write to the local demo database, never to the gym project.
assert.equal(process.env.GCLOUD_PROJECT, "demo-gym-capacity");
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8188");
admin.initializeApp({ projectId: "demo-gym-capacity" });
const db = admin.firestore();
const { bookSlotPreview } = require("../functions/bookings/bookSlot");
const at = (time, day = "2030-06-03") => admin.firestore.Timestamp.fromDate(new Date(`${day}T${time}:00+02:00`));
const book = (userId, time, extra = {}) => bookSlotPreview.run({
  auth: { uid: userId },
  data: { slotId: `slot-${time}`, timestampMillis: at(time).toMillis(), ...extra },
});

async function seed(times = ["15:30", "16:00", "16:30", "17:00", "17:30"]) {
  const response = await fetch("http://127.0.0.1:8188/emulator/v1/projects/demo-gym-capacity/databases/(default)/documents", { method: "DELETE" });
  assert.equal(response.ok, true);
  const batch = db.batch();
  for (let i = 0; i < 20; i++) batch.set(db.doc(`users/u${i}`), { role: "client" });
  batch.set(db.doc("users/coach"), { role: "admin" });
  for (const time of times) batch.set(db.doc(`slots/slot-${time}`), { timestamp: at(time), capacity: 4, locked: false });
  await batch.commit();
}

async function seedBookings(time, count, { slotId = `slot-${time}`, legacy = false } = {}) {
  const batch = db.batch();
  for (let i = 0; i < count; i++) {
    batch.set(db.doc(`bookings/seed-${slotId}-${i}`), {
      slotId, userId: `seed-${slotId}-${i}`, checkedIn: false,
      ...(legacy ? {} : { slotTimestamp: at(time) }),
    });
  }
  await batch.commit();
}

test("first adjacent bookings, simultaneous on empty templates, never exceed six", async () => {
  await seed([]);
  await db.doc("slotTemplates/t16").set({ active: true, time: "16:00", days: [1], capacity: 4 });
  await db.doc("slotTemplates/t1630").set({ active: true, time: "16:30", days: [1], capacity: 4 });
  const requests = Array.from({ length: 8 }, (_, i) => {
    const first = i % 2 === 0;
    return book(`u${i}`, first ? "16:00" : "16:30", { slotId: null, templateId: first ? "t16" : "t1630" });
  });
  const results = await Promise.allSettled(requests);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 6);
  assert.ok(results.filter((result) => result.status === "rejected").every((result) => result.reason.code === "resource-exhausted"));
  const bookings = await db.collection("bookings").get();
  assert.equal(bookings.size, 6);
  for (const time of ["16:00", "16:30"]) {
    assert.ok(bookings.docs.filter((doc) => doc.data().slotTimestamp.isEqual(at(time))).length <= 4);
  }
  assert.equal((await db.collection("slots").get()).size, 2);
});

test("adjacent slots compete for the final shared place", async () => {
  await seed();
  await seedBookings("16:00", 3);
  await seedBookings("16:30", 2);
  const results = await Promise.allSettled([book("u0", "16:00"), book("u1", "16:30")]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.find((result) => result.status === "rejected").reason.code, "resource-exhausted");
  assert.equal((await db.collection("bookings").get()).size, 6);
});

test("both neighbors constrain a middle slot, in either booking order", async () => {
  await seed();
  await seedBookings("16:00", 4);
  await seedBookings("17:00", 4);
  await book("u0", "16:30");
  await book("u1", "16:30");
  await assert.rejects(book("u2", "16:30"), { code: "resource-exhausted" });
  assert.equal((await db.collection("bookings").get()).size, 10);
});

test("cancellation restores availability without updating a booking counter", async () => {
  await seed();
  await seedBookings("16:00", 4);
  await seedBookings("16:30", 2);
  await db.doc("slots/slot-16:00").update({ bookingCount: 99 });
  await assert.rejects(book("u0", "16:30"), { code: "resource-exhausted" });
  await db.doc("bookings/seed-slot-16:00-0").delete();
  await book("u0", "16:30");
  assert.equal((await db.collection("bookings").get()).size, 6);
});

test("cancellation racing a booking cannot overfill the pair", async () => {
  await seed();
  await seedBookings("16:00", 4);
  await seedBookings("16:30", 2);
  const results = await Promise.allSettled([
    db.doc("bookings/seed-slot-16:00-0").delete(),
    book("u0", "16:30"),
  ]);
  assert.equal(results[0].status, "fulfilled");
  if (results[1].status === "rejected") await book("u0", "16:30");
  assert.equal((await db.collection("bookings").get()).size, 6);
});

test("legacy and duplicate slot records still count toward neighboring limits", async () => {
  await seed();
  await db.doc("slots/duplicate").set({ timestamp: at("16:00"), capacity: 4 });
  await seedBookings("16:00", 2, { legacy: true });
  await seedBookings("16:00", 2, { slotId: "duplicate", legacy: true });
  await seedBookings("16:30", 2);
  await assert.rejects(book("u0", "16:30"), { code: "resource-exhausted" });
  assert.equal((await db.collection("bookings").get()).size, 6);
});

test("admin override keeps existing bookings and blocks further client reservations", async () => {
  await seed();
  await seedBookings("16:00", 4);
  await seedBookings("16:30", 2);
  await db.doc("slots/slot-16:30").update({ locked: true });
  const result = await book("coach", "16:30", { userId: "u0", adminOverride: true });
  assert.equal(result.overCapacity, true);
  assert.equal((await db.collection("bookings").get()).size, 7);
  await db.doc("slots/slot-16:30").update({ locked: false });
  await assert.rejects(book("u1", "16:30"), { code: "resource-exhausted" });
  assert.equal((await db.collection("bookings").get()).size, 7);
});

test("large gaps do not interact; explicit capacities and fallback of four work", async () => {
  await seed(["11:00", "15:30", "16:00", "17:00"]);
  await seedBookings("11:00", 4);
  await db.doc("slots/slot-15:30").update({ capacity: 2 });
  await book("u0", "15:30");
  await book("u1", "15:30");
  await assert.rejects(book("u2", "15:30"), { code: "resource-exhausted" });
  await db.doc("slots/slot-17:00").update({ capacity: admin.firestore.FieldValue.delete() });
  for (let i = 3; i < 7; i++) await book(`u${i}`, "17:00");
  await assert.rejects(book("u7", "17:00"), { code: "resource-exhausted" });
});

test("one-booking-per-day, timestamp validation, and client override restrictions remain", async () => {
  await seed();
  await assert.rejects(book("u0", "16:00", { timestampMillis: at("17:00").toMillis() }), { code: "failed-precondition" });
  await assert.rejects(book("u0", "16:00", { adminOverride: true }), { code: "permission-denied" });
  await assert.rejects(book("u0", "16:00", { allowOverbook: true }), { code: "permission-denied" });
  const results = await Promise.allSettled([book("u0", "16:00"), book("u0", "17:00")]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.find((result) => result.status === "rejected").reason.code, "already-exists");
});

test.after(async () => {
  await db.terminate();
  await admin.app().delete();
});
