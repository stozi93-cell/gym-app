import test from "node:test";
import assert from "node:assert/strict";
import { selectInitialBookingDay } from "../src/bookings/selectInitialBookingDay.mjs";

const days = [{ key: "today" }, { key: "next" }, { key: "later" }];
const slot = (id, { open = false, booked = false } = {}) => ({ id, open, booked });
const choose = (slotsByDay) => selectInitialBookingDay({
  todayKey: "today",
  days,
  slotsByDay,
  hasUserBooking: (slots) => slots.some((item) => item.booked),
  isBookable: (item) => item.open,
});

test("keeps today when an open slot remains", () => {
  assert.equal(choose({ today: [slot("a", { open: true })] }), "today");
});

test("keeps today when the client already has a booking", () => {
  assert.equal(choose({ today: [slot("a", { booked: true })] }), "today");
});

test("selects the first later day with an open slot", () => {
  assert.equal(choose({
    today: [slot("a")],
    next: [slot("b")],
    later: [slot("c", { open: true })],
  }), "later");
});

test("an existing future booking takes priority even when its slot is full", () => {
  assert.equal(choose({
    today: [],
    next: [slot("b", { booked: true })],
    later: [slot("c", { open: true })],
  }), "next");
});

test("keeps today when no relevant future day exists", () => {
  assert.equal(choose({ today: [], next: [], later: [] }), "today");
});
