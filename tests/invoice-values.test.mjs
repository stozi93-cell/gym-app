import test from "node:test";
import assert from "node:assert/strict";
import { assertUnchanged, correctionValues, money } from "../src/billing/invoiceValues.mjs";

test("money supports decimal comma and rejects invalid or imprecise amounts", () => {
  assert.equal(money("1,25"), 1.25);
  assert.equal(money("5000"), 5000);
  for (const input of ["", " ", "-1", "Infinity", "NaN", "1e3", "1.234", "1,2,3", "999999999999999999"]) {
    assert.throws(() => money(input));
  }
});

test("correction derives unpaid, partial, paid and free statuses", () => {
  const current = { amount: 5000, paidAmount: 5000, status: "paid", paidAt: new Date() };
  for (const [paidAmount, status] of [[0, "pending"], [1500, "partially_paid"], [3500, "paid"]]) {
    const result = correctionValues(current, { amount: 3500, paidAmount });
    assert.equal(result.status, status);
    assert.equal(result.paidAt, paidAmount ? current.paidAt : null);
  }
  assert.equal(correctionValues(current, { amount: 0, paidAmount: 0 }).status, "paid");
});

test("a price reduction cannot silently remove an overpayment", () => {
  assert.throws(() => correctionValues({}, { amount: 3500, paidAmount: 5000 }));
});

test("cancelled invoices stay cancelled when their amounts are corrected", () => {
  assert.equal(correctionValues({ status: "cancelled" }, { amount: 3500, paidAmount: 0 }).status, "cancelled");
});

test("stale edits detect payment, price, status, date and revision changes", () => {
  const current = { amount: 5000, paidAmount: 0, status: "pending", paidAt: null };
  assert.doesNotThrow(() => assertUnchanged(current, { ...current }));
  for (const change of [{ amount: 4500 }, { paidAmount: 1000 }, { status: "paid" }, { paidAt: new Date() }, { billingRevision: 1 }]) {
    assert.throws(() => assertUnchanged({ ...current, ...change }, current));
  }
});
