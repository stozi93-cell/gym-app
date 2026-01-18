import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  updateDoc,
  where,
} from "firebase/firestore";
import { Link } from "react-router-dom";
import { db } from "../firebase";

const MAX_CAPACITY = 5;
const WINDOW_DAYS = 7;

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
        locked: false,
      });
    });
  }

  return out;
}

export default function AdminSlots() {
  const [slots, setSlots] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [users, setUsers] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [overbook, setOverbook] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData(dateOverride) {
    setLoading(true);

    const start = dateOverride ?? new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(start.getDate() + WINDOW_DAYS);

    const tplSnap = await getDocs(collection(db, "slotTemplates"));
    const tplData = tplSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));
    setTemplates(tplData);

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
      timestamp: d.data().timestamp.toDate(),
      generated: false,
    }));

    const generatedSlots = generateSlotsFromTemplates(
      tplData,
      start,
      WINDOW_DAYS
    ).filter(
      (g) =>
        !realSlots.some(
          (s) => s.timestamp.getTime() === g.timestamp.getTime()
        )
    );

    setSlots(
      [...realSlots, ...generatedSlots].sort(
        (a, b) => a.timestamp - b.timestamp
      )
    );

    const bookingSnap = await getDocs(collection(db, "bookings"));
    setBookings(
      bookingSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
    );

    const userSnap = await getDocs(collection(db, "users"));
    setUsers(
      userSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
    );

    setLoading(false);
  }

  /* helpers */
  const isPast = (slot) => slot.timestamp < new Date();
  const slotBookings = (slotId) =>
    bookings.filter((b) => b.slotId === slotId);

  async function materializeSlot(slot, extra = {}) {
    if (!slot.generated) return slot.id;

    const ref = await addDoc(collection(db, "slots"), {
      timestamp: slot.timestamp,
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
      locked: false,
    });

    setDate("");
    setTime("");
    loadData(filterDate ? new Date(filterDate) : undefined);
  }

  async function adminBook(slot, userId) {
    if (!userId || slot.locked || isPast(slot)) return;

    if (
      slotBookings(slot.id).length >= MAX_CAPACITY &&
      !overbook
    ) {
      return alert("Slot je pun.");
    }

    const slotId = await materializeSlot(slot);

    await addDoc(collection(db, "bookings"), {
      slotId,
      userId,
      createdAt: new Date(),
      checkedIn: false,
    });

    loadData(filterDate ? new Date(filterDate) : undefined);
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

  async function handleCheckIn(booking, ts) {
    if (booking.checkedIn) return;

    await updateDoc(doc(db, "bookings", booking.id), {
      checkedIn: true,
      checkedInAt: new Date(),
    });

    const subSnap = await getDocs(
      query(
        collection(db, "clientSubscriptions"),
        where("userId", "==", booking.userId)
      )
    );

    if (!subSnap.docs.length) return loadData();

    const subDoc = subSnap.docs[0];
    const sub = subDoc.data();
    if (!sub.startDate) return loadData();

    const start = sub.startDate.toDate();
    const weekIndex = Math.floor(
      (ts - start) / (7 * 24 * 60 * 60 * 1000)
    );

    const arr = sub.checkInsArray || [];
    arr[weekIndex] = (arr[weekIndex] || 0) + 1;

    await updateDoc(doc(db, "clientSubscriptions", subDoc.id), {
      checkInsArray: arr,
    });

    loadData(filterDate ? new Date(filterDate) : undefined);
  }

  async function cancelBooking(b) {
    await deleteDoc(doc(db, "bookings", b.id));
    loadData(filterDate ? new Date(filterDate) : undefined);
  }

  /* grouping */
  const groupedSlots = slots.reduce((acc, s) => {
    const key = s.timestamp.toISOString().split("T")[0];
    (acc[key] ||= []).push(s);
    return acc;
  }, {});

  const todayStr = new Date().toISOString().split("T")[0];

  const visibleGroups = filterDate
    ? { [filterDate]: groupedSlots[filterDate] || [] }
    : Object.fromEntries(
        Object.entries(groupedSlots).filter(
          ([k]) => k >= todayStr
        )
      );

  const orderedKeys = Object.keys(visibleGroups).sort();
  const defaultOpenKey =
    orderedKeys.includes(todayStr)
      ? todayStr
      : orderedKeys[0];

  if (loading) return <p className="p-4 text-neutral-400">Učitavanje…</p>;

  return (
    <div className="px-2 py-1 space-y-6">
      <h1 className="px-2 text-xl font-semibold text-white">
        Raspored
      </h1>

      {/* IZABERI DATUM */}
      <div className="mx-2 rounded-xl bg-neutral-900 p-4 space-y-2">
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
      <div className="mx-2 rounded-xl bg-neutral-900 p-4 space-y-2">
        <p className="text-sm font-medium text-neutral-200">
          Novi termin
        </p>
        <div className="flex gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded bg-neutral-800 px-2 py-1 text-sm"
          />
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="rounded bg-neutral-800 px-2 py-1 text-sm"
          />
          <button
            onClick={createSlot}
            className="rounded bg-blue-600 px-3 py-1 text-sm text-white"
          >
            Kreiraj
          </button>
        </div>
      </div>

      {/* OVERBOOKING */}
      <div className="mx-2 rounded-xl bg-neutral-900 p-4">
        <label className="flex items-center gap-3 text-sm text-white">
          <input
            type="checkbox"
            checked={overbook}
            onChange={(e) => setOverbook(e.target.checked)}
          />
          Dozvoli overbooking
        </label>
      </div>

      {/* SLOTS */}
      <div className="space-y-4">
        {orderedKeys.map((dateKey) => {
          const daySlots = visibleGroups[dateKey];
          const bookingCount = daySlots.reduce(
            (sum, s) => sum + slotBookings(s.id).length,
            0
          );

          return (
            <details
              key={dateKey}
              open={dateKey === defaultOpenKey}
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
                  const bks = slotBookings(slot.id);

                  return (
                    <div
                      key={slot.id}
                      className="rounded-lg bg-neutral-800 p-3 space-y-2 border border-neutral-700"
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
                            {bks.length} / {MAX_CAPACITY}
                          </p>
                        </div>

                        <div className="flex flex-col items-end gap-1">
                          <button
                            onClick={() => toggleLock(slot)}
                            className="text-xs text-neutral-400"
                          >
                            {slot.locked ? "Otključaj" : "Zaključaj"}
                          </button>

                          <select
                            disabled={slot.locked || isPast(slot)}
                            onChange={(e) =>
                              adminBook(slot, e.target.value)
                            }
                            className="rounded bg-neutral-700 px-2 py-1 text-xs"
                          >
                            <option value="">Klijent</option>
                            {users.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name} {u.surname}
                              </option>
                            ))}
                          </select>
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
                                  onClick={() =>
                                    handleCheckIn(
                                      b,
                                      slot.timestamp
                                    )
                                  }
                                  className="text-green-400"
                                >
                                  Čekiraj
                                </button>
                              ) : (
                                <span className="text-green-500">
                                  ✔︎
                                </span>
                              )}
                              <button
                                onClick={() => cancelBooking(b)}
                                className="text-red-400"
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
    </div>
  );
}
