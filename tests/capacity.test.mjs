import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateAvailability,
  countBookingsByTimestamp,
  getSlotAvailability,
} from "../functions/bookings/capacity.mjs";

const at = (time) => new Date(`2030-06-03T${time}:00+02:00`);

test("both neighbors constrain each slot, not fixed pairs", () => {
  for (let previousBooked = 0; previousBooked <= 8; previousBooked++) {
    for (let booked = 0; booked <= 8; booked++) {
      for (let nextBooked = 0; nextBooked <= 8; nextBooked++) {
        const result = calculateAvailability({ capacity: 4, booked, previousBooked, nextBooked });
        assert.ok(result.available >= 0);
        if (result.available > 0) {
          assert.ok(booked + result.available <= 4);
          assert.ok(previousBooked + booked + result.available <= 6);
          assert.ok(nextBooked + booked + result.available <= 6);
        }
        const nextWouldFit = booked + 1 <= 4 && previousBooked + booked + 1 <= 6 && nextBooked + booked + 1 <= 6;
        assert.equal(result.available > 0, nextWouldFit);
      }
    }
  }
});

test("4/2/4 pattern and reverse booking order", () => {
  assert.equal(calculateAvailability({ capacity: 4, previousBooked: 4, nextBooked: 4 }).effectiveCapacity, 2);
  assert.equal(calculateAvailability({ capacity: 4, previousBooked: 2, nextBooked: 3 }).effectiveCapacity, 3);
  assert.equal(calculateAvailability({ capacity: 4, previousBooked: 2, nextBooked: 2 }).effectiveCapacity, 4);
});

test("duplicates are aggregated by occurrence, without double-counting query results", () => {
  const slots = [
    { id: "one", timestamp: at("16:00") },
    { id: "two", timestamp: at("16:00") },
  ];
  const rows = [
    { id: "b1", slotId: "one" },
    { id: "b2", slotId: "two" },
    { id: "b2", slotId: "two" },
    { id: "b3", slotId: "missing", slotTimestamp: at("16:00") },
  ];
  const counts = countBookingsByTimestamp(rows, slots);
  assert.equal(counts.get(at("16:00").getTime()), 3);
  assert.equal(getSlotAvailability({ timestamp: at("16:30"), capacity: 4 }, counts).available, 3);
});

test("hidden, locked, and no-longer-listed neighboring slots still reserve capacity", () => {
  const bookings = Array.from({ length: 4 }, (_, i) => ({ id: `b${i}`, slotTimestamp: at("16:00") }));
  const counts = countBookingsByTimestamp(bookings);
  assert.equal(getSlotAvailability({ timestamp: at("16:30"), capacity: 4 }, counts).available, 2);
  assert.equal(getSlotAvailability({ timestamp: at("17:00"), capacity: 4 }, counts).available, 4);
});

test("morning/afternoon gaps and different Belgrade days are independent", () => {
  const counts = new Map([
    [at("11:00").getTime(), 4],
    [new Date("2030-06-02T23:30:00+02:00").getTime(), 6],
  ]);
  assert.equal(getSlotAvailability({ timestamp: at("15:30"), capacity: 4 }, counts).available, 4);
  assert.equal(getSlotAvailability({ timestamp: at("00:00"), capacity: 4 }, counts).available, 4);
});

test("an admin overbooking never creates negative availability", () => {
  const result = calculateAvailability({ capacity: 4, booked: 5, previousBooked: 4 });
  assert.equal(result.available, 0);
  assert.equal(result.booked, 5);
  assert.equal(result.overCapacity, true);
});

test("invalid capacity falls back to four; explicit larger limits are preserved", () => {
  for (const capacity of [undefined, null, 0, -1, "invalid"]) {
    assert.equal(calculateAvailability({ capacity }).baseCapacity, 4);
  }
  assert.equal(calculateAvailability({ capacity: 5, previousBooked: 1 }).available, 5);
});
