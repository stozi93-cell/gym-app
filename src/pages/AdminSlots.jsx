import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  updateDoc,
  setDoc,
  where,
  Timestamp,
  onSnapshot,
} from "firebase/firestore";
import { Link } from "react-router-dom";
import { db } from "../firebase";
import {
  bookSlot as createBooking,
  getBookingErrorMessage,
  getTemplateSlotId,
} from "../bookings/bookSlot";
import { checkInBooking } from "../bookings/checkInBooking";

const DEFAULT_CAPACITY = 5;
const MANUAL_SLOT_CAPACITY = 4;
const WINDOW_DAYS = 7;

function LockIcon({ locked }) {
  return locked ? (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="18" height="11" x="3" y="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ) : (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="18" height="11" x="3" y="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  );
}

function getCapacity(value) {
  const capacity = Number(value);
  return Number.isFinite(capacity) && capacity > 0
    ? capacity
    : DEFAULT_CAPACITY;
}

/* ─────────────────────────────
   Slot generation (shared model)
───────────────────────────── */
function generateSlotsFromTemplates(templates, startDate, days) {
  const out = [];

  for (let i = 0; i < days; i++) {
    const base = new Date(startDate);
    base.setDate(base.getDate() + i);
    const weekday = base.getDay();

    templates.forEach((tpl) => {
      if (!tpl.active) return;
      if (!tpl.days.includes(weekday)) return;

      const [h, m] = tpl.time.split(":");
      const d = new Date(base);
      d.setHours(Number(h), Number(m), 0, 0);

      out.push({
        id: `tpl_${tpl.id}_${d.toISOString()}`,
        timestamp: d,
        generated: true,
        templateId: tpl.id,
        capacity: getCapacity(tpl.capacity),
        locked: false, // default, overridden if real slot exists
      });
    });
  }

  return out;
}

export default function AdminSlots() {
  const [slots, setSlots] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [pendingBookingIds, setPendingBookingIds] = useState([]);
  const pendingBookingIdsRef = useRef(new Set());
  const [statusMessage, setStatusMessage] = useState("");
  const [bookingSlot, setBookingSlot] = useState(null);
  const [clientSearch, setClientSearch] = useState("");
  const [clientBookingPending, setClientBookingPending] = useState(false);

  useEffect(() => {
  if (filterDate) {
    loadData(new Date(filterDate));
  } else {
    loadData();
  }
}, [filterDate]);

  useEffect(() => {
    return onSnapshot(collection(db, "bookings"), (snapshot) => {
      setBookings(
        snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
      );
    });
  }, []);

  async function loadData(dateOverride) {
    setLoading(true);

    const startDate = dateOverride
  ? new Date(dateOverride)
  : new Date();

startDate.setHours(0, 0, 0, 0);

const endDate = new Date(startDate);
endDate.setDate(startDate.getDate() + WINDOW_DAYS);

const start = Timestamp.fromDate(startDate);
const end = Timestamp.fromDate(endDate);

    const tplSnap = await getDocs(collection(db, "slotTemplates"));
    const tplData = tplSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    const slotSnap = await getDocs(
      query(
        collection(db, "slots"),
        where("timestamp", ">=", start),
        where("timestamp", "<=", end),
        orderBy("timestamp")
      )
    );

    const realSlots = slotSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      capacity: getCapacity(d.data().capacity),
      timestamp: d.data().timestamp.toDate(),
      generated: false,
    }));

    const templateSlots = generateSlotsFromTemplates(
  tplData,
  startDate,
  WINDOW_DAYS
);

const mergedTemplateSlots = templateSlots.map((tplSlot) => {
  const matchingRealSlots = realSlots.filter(
    (r) => r.timestamp.getTime() === tplSlot.timestamp.getTime()
  );
  const real = matchingRealSlots[0];

  return real
    ? {
        ...tplSlot,
        id: real.id,
        slotIds: matchingRealSlots.map((slot) => slot.id),
        locked: matchingRealSlots.some((slot) => slot.locked),
        generated: false,
      }
    : tplSlot;
});

const manualSlots = realSlots.filter(
  (real) =>
    !templateSlots.some(
      (tplSlot) =>
        tplSlot.timestamp.getTime() === real.timestamp.getTime()
    )
);

setSlots(
  [...mergedTemplateSlots, ...manualSlots].sort(
    (a, b) => a.timestamp - b.timestamp
  )
);

    const userSnap = await getDocs(collection(db, "users"));
    setUsers(
      userSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
    );

    setLoading(false);
  }

  /* helpers */
  const slotBookings = (slot) => {
    const slotIds = slot.slotIds || [slot.id];
    return bookings.filter((b) => slotIds.includes(b.slotId));
  };
  const beginBookingAction = (bookingId) => {
    if (pendingBookingIdsRef.current.has(bookingId)) return false;

    pendingBookingIdsRef.current.add(bookingId);
    setPendingBookingIds(Array.from(pendingBookingIdsRef.current));
    return true;
  };
  const finishBookingAction = (bookingId) => {
    pendingBookingIdsRef.current.delete(bookingId);
    setPendingBookingIds(Array.from(pendingBookingIdsRef.current));
  };

  async function materializeSlot(slot, extra = {}) {
    if (!slot.generated) return slot.id;

    const ref = doc(
      db,
      "slots",
      getTemplateSlotId(slot.templateId, slot.timestamp)
    );

    await setDoc(ref, {
      timestamp: slot.timestamp,
      capacity: slot.capacity,
      createdFromTemplate: slot.templateId,
      locked: false,
      ...extra,
    });

    return ref.id;
  }

  /* actions */
  async function createSlot() {
    if (!date || !time) return;

    await addDoc(collection(db, "slots"), {
      timestamp: new Date(`${date}T${time}:00`),
      capacity: MANUAL_SLOT_CAPACITY,
      locked: false,
    });

    setDate("");
    setTime("");
    loadData(filterDate ? new Date(filterDate) : undefined);
  }

  async function adminBook(slot, userId) {
    if (!userId) return false;

    try {
      await createBooking({
        slot,
        userId,
        adminOverride: true,
      });
      setStatusMessage("Rezervacija je sacuvana.");
      loadData(filterDate ? new Date(filterDate) : undefined);
      return true;
    } catch (error) {
      const message = getBookingErrorMessage(error);
      setStatusMessage(message);
      alert(message);
      return false;
    }
  }

  async function selectClient(userId) {
    if (!bookingSlot || clientBookingPending) return;

    setClientBookingPending(true);
    const saved = await adminBook(bookingSlot, userId);
    setClientBookingPending(false);

    if (saved) {
      setBookingSlot(null);
      setClientSearch("");
    }
  }

  async function toggleLock(slot) {
    if (slot.generated) {
      await materializeSlot(slot, { locked: true });
    } else {
      await updateDoc(doc(db, "slots", slot.id), {
        locked: !slot.locked,
      });
    }

    loadData(filterDate ? new Date(filterDate) : undefined);
  }

  async function handleCheckIn(booking) {
    if (booking.checkedIn || !beginBookingAction(booking.id)) return;

    try {
      await checkInBooking(booking.id);
      setStatusMessage("Klijent je cekiran.");
    } catch (error) {
      const message =
        error.message || "Cekiranje nije uspelo. Pokusajte ponovo.";
      setStatusMessage(message);
      alert(message);
    } finally {
      finishBookingAction(booking.id);
    }
  }

  async function cancelBooking(b) {
    if (!beginBookingAction(b.id)) return;

    try {
      await deleteDoc(doc(db, "bookings", b.id));
      setStatusMessage("Rezervacija je otkazana.");
    } catch (error) {
      const message =
        error.message || "Otkazivanje nije uspelo. Pokusajte ponovo.";
      setStatusMessage(message);
      alert(message);
    } finally {
      finishBookingAction(b.id);
    }
  }

  /* grouping */
  const groupedSlots = slots.reduce((acc, s) => {
    const key = s.timestamp.toISOString().split("T")[0];
    (acc[key] ||= []).push(s);
    return acc;
  }, {});

  const visibleGroups = filterDate
  ? { [filterDate]: groupedSlots[filterDate] || [] }
  : groupedSlots;

  const orderedKeys = Object.keys(visibleGroups).sort();
  const matchingUsers = useMemo(() => {
    const search = clientSearch.trim().toLocaleLowerCase("sr-Latn-RS");

    return [...users]
      .sort((a, b) =>
        `${a.name || ""} ${a.surname || ""}`.localeCompare(
          `${b.name || ""} ${b.surname || ""}`,
          "sr-Latn-RS"
        )
      )
      .filter((user) => {
        if (!search) return true;

        return `${user.name || ""} ${user.surname || ""} ${user.email || ""} ${user.phone || ""}`
          .toLocaleLowerCase("sr-Latn-RS")
          .includes(search);
      });
  }, [clientSearch, users]);

  if (loading) {
  return (
    <div className="space-y-4">
      <div className="h-4 w-2/3 rounded bg-neutral-700/50" />
      <div className="h-4 w-full rounded bg-neutral-700/50" />
      <div className="h-4 w-5/6 rounded bg-neutral-700/50" />
    </div>
  );
}


  return (
    <div className="px-2 py-1 space-y-3">
      {statusMessage && (
        <div className="mx-2 rounded bg-neutral-800 px-3 py-2 text-sm text-neutral-200">
          {statusMessage}
        </div>
      )}
      

      {/* IZABERI DATUM */}
      <div className="mx-2 rounded-xl bg-neutral-900 p-4 space-y-1">
        <p className="text-sm font-medium text-neutral-200">
          Izaberi datum
        </p>
        <div className="flex gap-2">
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="rounded bg-neutral-800 px-2 py-1 text-sm"
          />
          {filterDate && (
            <button
              onClick={() => setFilterDate("")}
              className="text-sm text-blue-400"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* NOVI TERMIN */}
      <div className="mx-2 rounded-xl bg-neutral-900 p-4 space-y-1">
        <p className="text-sm font-medium text-neutral-200">
          Novi termin
        </p>
        <div className="grid grid-cols-[minmax(0,1fr)_84px_auto] items-end gap-3">
          <label className="min-w-0 text-xs text-neutral-400">
            Datum
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 block w-full min-w-0 rounded bg-neutral-800 px-1.5 py-1 text-xs text-white"
            />
          </label>
          <label className="min-w-0 text-xs text-neutral-400">
            Vreme
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="mt-1 block w-full min-w-0 rounded bg-neutral-800 px-1.5 py-1 text-xs text-white"
            />
          </label>
          <button
            onClick={createSlot}
            className="rounded bg-blue-600 px-3 py-1 text-sm text-white"
          >
            Kreiraj
          </button>
        </div>
      </div>

      {/* SLOTS */}
      <div className="space-y-4">
        {orderedKeys.map((dateKey) => {
          const daySlots = visibleGroups[dateKey];
          const bookingCount = daySlots.reduce(
            (sum, s) => sum + slotBookings(s).length,
            0
          );

          return (
            <details
              key={dateKey}
              className="rounded-xl bg-neutral-900 mx-2"
            >
              <summary className="cursor-pointer px-4 py-3 font-medium text-white">
                {new Date(dateKey).toLocaleDateString("sr-Latn-RS", {
                  weekday: "long",
                  day: "2-digit",
                  month: "long",
                })}{" "}
                ({bookingCount})
              </summary>

              <div className="p-3 space-y-3">
                {daySlots.map((slot) => {
                  const bks = slotBookings(slot);

                  return (
                    <div
                      key={slot.id}
                      className={`rounded-lg p-3 space-y-2 border ${
                        slot.locked
                          ? "border-red-900/70 bg-neutral-900/80"
                          : "border-neutral-700 bg-neutral-800"
                      }`}
                    >
                      <div className="flex justify-between">
                        <div>
                          <p className="text-sm font-medium text-white">
                            {slot.timestamp.toLocaleTimeString("sr-RS", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                          <p className="text-xs text-neutral-400">
                            {bks.length} / {slot.capacity}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setBookingSlot(slot);
                              setClientSearch("");
                            }}
                            className="rounded bg-neutral-700 px-2 py-1 text-xs text-white"
                          >
                            Klijent
                          </button>

                          <button
                            onClick={() => toggleLock(slot)}
                            title={slot.locked ? "Otključaj termin" : "Zaključaj termin"}
                            aria-label={slot.locked ? "Otključaj termin" : "Zaključaj termin"}
                            className={`rounded border p-1.5 ${
                              slot.locked
                                ? "border-red-900 bg-red-950/50 text-red-400"
                                : "border-green-900 bg-green-950/40 text-green-400"
                            }`}
                          >
                            <LockIcon locked={slot.locked} />
                          </button>
                        </div>
                      </div>

                      {bks.length === 0 && (
                        <div className="text-xs text-neutral-500 italic">
                          Nema rezervacija
                        </div>
                      )}

                      {bks.map((b) => {
                        const u = users.find(
                          (u) => u.id === b.userId
                        );
                        const isPending =
                          pendingBookingIds.includes(b.id);
                        return (
                          <div
                            key={b.id}
                            className="flex justify-between text-sm"
                          >
                            <Link
                              to={`/profil/${b.userId}`}
                              className="text-blue-400 truncate"
                            >
                              {u
                                ? `${u.name} ${u.surname}`
                                : b.userId}
                            </Link>

                            <div className="flex gap-3">
                              {!b.checkedIn ? (
                                <button
                                  disabled={isPending}
                                  onClick={() =>
                                    handleCheckIn(b)
                                  }
                                  className="text-green-400 disabled:opacity-40"
                                >
                                  Čekiraj
                                </button>
                              ) : (
                                <span className="text-green-500">
                                  ✔︎
                                </span>
                              )}
                              <button
                                disabled={isPending}
                                onClick={() => cancelBooking(b)}
                                className="text-red-400 disabled:opacity-40"
                              >
                                Otkaži
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>

      {bookingSlot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          onClick={() => setBookingSlot(null)}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-neutral-700 bg-neutral-900 p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-white">
                Izaberi klijenta
              </p>
              <button
                onClick={() => setBookingSlot(null)}
                aria-label="Zatvori"
                title="Zatvori"
                className="px-2 text-xl leading-none text-neutral-400 hover:text-white"
              >
                ×
              </button>
            </div>

            <input
              autoFocus
              type="search"
              value={clientSearch}
              onChange={(event) => setClientSearch(event.target.value)}
              placeholder="Pretraži klijente"
              className="mb-3 w-full rounded bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-500"
            />

            <div className="max-h-72 space-y-1 overflow-y-auto">
              {matchingUsers.map((user) => (
                <button
                  key={user.id}
                  disabled={clientBookingPending}
                  onClick={() => selectClient(user.id)}
                  className="block w-full rounded px-3 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
                >
                  {user.name} {user.surname}
                </button>
              ))}

              {matchingUsers.length === 0 && (
                <p className="px-3 py-2 text-sm text-neutral-500">
                  Nema pronađenih klijenata.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
