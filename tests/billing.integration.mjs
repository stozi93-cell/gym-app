import { after, test } from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase/app";
import { connectFirestoreEmulator, doc, getDoc, getFirestore, setDoc, terminate, Timestamp } from "firebase/firestore";
import { updateInvoice } from "../src/billing/updateInvoice.mjs";

assert.equal(process.env.GCLOUD_PROJECT, "demo-gym-billing");
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8188");
const app = initializeApp({ projectId: "demo-gym-billing", apiKey: "demo-only" });
const db = getFirestore(app);
connectFirestoreEmulator(db, "127.0.0.1", 8188);
after(async () => { await terminate(db); await deleteApp(app); });

const original = {
  amount: 5000, paidAmount: 5000, status: "paid",
  paidAt: Timestamp.fromDate(new Date("2026-08-05T10:00:00Z")),
  clientId: "demo-client", clientSubscriptionId: "demo-sub", subscriptionId: "demo-package",
  currency: "RSD", createdAt: Timestamp.fromDate(new Date("2026-08-01T10:00:00Z")),
};
async function seed(id, values = original) {
  await setDoc(doc(db, "billing", id), values);
  return values;
}
async function read(id) { return (await getDoc(doc(db, "billing", id))).data(); }

test("unpay and lower price atomically, preserving the original payment and membership", async () => {
  const id = "wrong-payment";
  await seed(id);
  const subscription = { active: true, checkInsArray: [2, 3], billingId: id };
  await setDoc(doc(db, "clientSubscriptions", "demo-sub"), subscription);
  await updateInvoice(db, id, original, { type: "correction", amount: "3500", paidAmount: "0" }, "coach");
  const result = await read(id);
  assert.equal(result.amount, 3500);
  assert.equal(result.paidAmount, 0);
  assert.equal(result.status, "pending");
  assert.equal(result.paidAt, null);
  assert.deepEqual(result.adjustmentHistory[0].before, {
    amount: 5000, paidAmount: 5000, status: "paid", paidAt: original.paidAt,
  });
  assert.equal(result.adjustmentHistory[0].by, "coach");
  for (const field of ["clientId", "clientSubscriptionId", "subscriptionId", "currency", "createdAt"]) {
    assert.deepEqual(result[field], original[field]);
  }
  assert.deepEqual((await getDoc(doc(db, "clientSubscriptions", "demo-sub"))).data(), subscription);
});

test("price-only edit keeps historical payment date, subsequent edits append history", async () => {
  const id = "historical";
  const before = await seed(id, { ...original, paidAmount: 2000, status: "partially_paid" });
  await updateInvoice(db, id, before, { type: "correction", amount: 4000, paidAmount: 2000 }, "coach");
  let result = await read(id);
  assert.deepEqual(result.paidAt, before.paidAt);
  await updateInvoice(db, id, result, { type: "payment", amount: 2000 }, "coach");
  result = await read(id);
  assert.equal(result.status, "paid");
  assert.equal(result.adjustmentHistory.length, 2);
  assert.equal(result.billingRevision, 2);
  assert.ok(result.paidAt.toMillis() > before.paidAt.toMillis());
});

test("restoring a payment from zero sets a date and handles decimal amounts", async () => {
  const id = "restored";
  const before = await seed(id, { ...original, paidAmount: 0, paidAt: null, status: "pending" });
  await updateInvoice(db, id, before, { type: "correction", amount: "1234,56", paidAmount: "1234,56" }, "coach");
  const result = await read(id);
  assert.equal(result.status, "paid");
  assert.equal(result.paidAmount, 1234.56);
  assert.ok(result.paidAt.toMillis() > original.paidAt.toMillis());
});

test("invalid updates do not change any invoice fields", async () => {
  const id = "invalid";
  await seed(id);
  for (const action of [{ type: "correction", amount: 3500, paidAmount: 5000 }, { type: "payment", amount: 1 }, { type: "correction", amount: -1, paidAmount: 0 }]) {
    await assert.rejects(updateInvoice(db, id, original, action, "coach"));
    assert.deepEqual(await read(id), original);
  }
});

test("concurrent payment and correction cannot overwrite one another", async () => {
  const id = "concurrent";
  const before = await seed(id, { ...original, paidAmount: 0, paidAt: null, status: "pending" });
  const results = await Promise.allSettled([
    updateInvoice(db, id, before, { type: "payment", amount: 1000 }, "coach-a"),
    updateInvoice(db, id, before, { type: "correction", amount: 4000, paidAmount: 0 }, "coach-b"),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejection = results.find((result) => result.status === "rejected");
  assert.match(rejection.reason.message, /u međuvremenu promenjena/);
  assert.equal((await read(id)).adjustmentHistory.length, 1);
});

test("cancellation preserves money and history; corrections do not reactivate it", async () => {
  const id = "cancelled";
  await seed(id);
  await updateInvoice(db, id, original, { type: "cancel" }, "coach");
  const cancelled = await read(id);
  assert.equal(cancelled.paidAmount, 5000);
  await updateInvoice(db, id, cancelled, { type: "correction", amount: 3500, paidAmount: 0 }, "coach");
  assert.equal((await read(id)).status, "cancelled");
  assert.equal((await read(id)).adjustmentHistory.length, 2);
});
