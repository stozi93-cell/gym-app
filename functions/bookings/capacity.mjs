export const DEFAULT_SLOT_CAPACITY = 4;
export const ADJACENT_CAPACITY = 6;
export const SLOT_INTERVAL_MS = 30 * 60 * 1000;

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Belgrade",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function getBelgradeDayKey(timestampMillis) {
  const parts = Object.fromEntries(
    dayFormatter.formatToParts(new Date(timestampMillis))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getCapacity(value) {
  const capacity = Number(value);
  return Number.isInteger(capacity) && capacity > 0
    ? capacity
    : DEFAULT_SLOT_CAPACITY;
}

export function toTimestampMillis(value) {
  if (value?.toMillis) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return typeof value === "number" ? value : NaN;
}

export function getWindowTimestamps(timestampMillis) {
  const dayKey = getBelgradeDayKey(timestampMillis);
  return [timestampMillis - SLOT_INTERVAL_MS, timestampMillis, timestampMillis + SLOT_INTERVAL_MS]
    .filter((value) => getBelgradeDayKey(value) === dayKey);
}

export function calculateAvailability({ capacity, booked = 0, previousBooked = 0, nextBooked = 0 }) {
  const baseCapacity = getCapacity(capacity);
  const effectiveCapacity = Math.max(0, Math.min(
    baseCapacity,
    ADJACENT_CAPACITY - previousBooked,
    ADJACENT_CAPACITY - nextBooked
  ));
  return {
    baseCapacity,
    booked,
    previousBooked,
    nextBooked,
    effectiveCapacity,
    available: Math.max(0, effectiveCapacity - booked),
    neighborLimited: effectiveCapacity < baseCapacity,
    overCapacity: booked > effectiveCapacity,
  };
}

export function countBookingsByTimestamp(bookings, slots = []) {
  const timestampBySlotId = new Map();
  for (const slot of slots) {
    const timestamp = toTimestampMillis(slot.timestamp);
    for (const id of slot.slotIds || [slot.id]) timestampBySlotId.set(id, timestamp);
  }

  const counts = new Map();
  const seenIds = new Set();
  for (const booking of bookings) {
    if (booking.id && seenIds.has(booking.id)) continue;
    if (booking.id) seenIds.add(booking.id);
    // Slot timestamps also cover older reservations without slotTimestamp.
    const timestamp = timestampBySlotId.get(booking.slotId) ?? toTimestampMillis(booking.slotTimestamp);
    if (!Number.isFinite(timestamp)) continue;
    counts.set(timestamp, (counts.get(timestamp) || 0) + 1);
  }
  return counts;
}

export function getSlotAvailability(slot, counts) {
  const timestamp = toTimestampMillis(slot.timestamp);
  const window = new Set(getWindowTimestamps(timestamp));
  const previous = timestamp - SLOT_INTERVAL_MS;
  const next = timestamp + SLOT_INTERVAL_MS;
  return calculateAvailability({
    capacity: slot.capacity,
    booked: counts.get(timestamp) || 0,
    previousBooked: window.has(previous) ? counts.get(previous) || 0 : 0,
    nextBooked: window.has(next) ? counts.get(next) || 0 : 0,
  });
}
