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

export default function AdminSlots() {
  const [slots, setSlots] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [overbook, setOverbook] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);

    const slotSnap = await getDocs(
      query(collection(db, "slots"), orderBy("timestamp"))
    );
    setSlots(slotSnap.docs.map(d => ({ id: d.id, ...d.data() })));

    const bookingSnap = await getDocs(collection(db, "bookings"));
    setBookings(bookingSnap.docs.map(d => ({ id: d.id, ...d.data() })));

    const userSnap = await getDocs(collection(db, "users"));
    setUsers(userSnap.docs.map(d => ({ id: d.id, ...d.data() })));

    setLoading(false);
  }

  /* ─────────────────────────────
     Helpers
  ───────────────────────────── */
  function getSlotBookings(slotId) {
    return bookings.filter(b => b.slotId === slotId);
  }

  function getSlotState(slot) {
    const now = new Date();
    const slotTime = slot.timestamp.toDate();
    const count = getSlotBookings(slot.id).length;

    if (slot.locked) return "locked";
    if (slotTime < now) return "past";
    if (count >= MAX_CAPACITY && !overbook) return "full";
    if (count >= MAX_CAPACITY - 1) return "warning";
    return "available";
  }

  const stateStyles = {
    past: "bg-neutral-800/50 text-neutral-400",
    full: "bg-red-900/30",
    warning: "bg-yellow-900/30",
    available: "bg-green-900/30",
    locked: "bg-neutral-900 border border-neutral-700",
  };

  /* ─────────────────────────────
     Actions
  ───────────────────────────── */
  async function createSlot() {
    if (!date || !time) return alert("Unesite datum i vreme");

    const ts = new Date(`${date}T${time}:00`);
    await addDoc(collection(db, "slots"), {
      timestamp: ts,
      locked: false,
    });

    setDate("");
    setTime("");
    loadData();
  }

  async function adminBook(slot, userId) {
    if (!userId || slot.locked) return;

    const count = getSlotBookings(slot.id).length;
    if (count >= MAX_CAPACITY && !overbook) {
      return alert("Slot je pun.");
    }

    await addDoc(collection(db, "bookings"), {
      slotId: slot.id,
      userId,
      createdAt: new Date(),
      checkedIn: false,
    });

    loadData();
  }

  async function toggleLock(slot) {
    await updateDoc(doc(db, "slots", slot.id), {
      locked: !slot.locked,
    });
    loadData();
  }

  async function handleCheckIn(booking, slotTimestamp) {
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
    const checkDate = slotTimestamp.toDate();
    const weekIndex = Math.floor(
      (checkDate - start) / (7 * 24 * 60 * 60 * 1000)
    );

    const arr = sub.checkInsArray || [];
    arr[weekIndex] = (arr[weekIndex] || 0) + 1;

    await updateDoc(doc(db, "clientSubscriptions", subDoc.id), {
      checkInsArray: arr,
    });

    loadData();
  }

  async function cancelBooking(booking) {
    await deleteDoc(doc(db, "bookings", booking.id));
    loadData();
  }

  /* ─────────────────────────────
     Grouping & filtering
  ───────────────────────────── */
  const groupedSlots = slots.reduce((acc, slot) => {
    const key = slot.timestamp.toDate().toISOString().split("T")[0];
    acc[key] = acc[key] || [];
    acc[key].push(slot);
    return acc;
  }, {});

  const todayKey = new Date().toISOString().split("T")[0];

  const visibleGroups = filterDate
    ? { [filterDate]: groupedSlots[filterDate] || [] }
    : Object.fromEntries(
        Object.entries(groupedSlots).filter(
          ([dateKey]) => dateKey >= todayKey
        )
      );

  if (loading) {
    return (
      <p className="p-4 text-neutral-400">
        Učitavanje termina…
      </p>
    );
  }

  return (
    <div className="px-4 py-6 space-y-6">
      <h1 className="text-xl font-semibold text-white">
        Raspored
      </h1>

      {/* CONTROLS */}
      <div className="rounded-xl bg-neutral-900 px-4 py-3 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={overbook}
            onChange={e => setOverbook(e.target.checked)}
          />
          Dozvoli overbooking
        </div>

        <div className="flex gap-2">
          <input
            type="date"
            value={filterDate}
            onChange={e => setFilterDate(e.target.value)}
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

      {/* CREATE SLOT */}
      <div className="rounded-xl bg-neutral-900 p-4 space-y-3">
        <p className="text-sm font-medium text-neutral-200">
  Novi termin
</p>
        <div className="flex flex-wrap gap-2">
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="rounded bg-neutral-800 px-2 py-1 text-sm"
          />
          <input
            type="time"
            value={time}
            onChange={e => setTime(e.target.value)}
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

      {/* SLOTS */}
      <div className="space-y-4">
        {Object.entries(visibleGroups).map(([dateKey, daySlots]) => {
          const dateObj = daySlots[0]?.timestamp.toDate();
          const label = dateObj?.toLocaleDateString(
            "sr-Latn-RS",
            { weekday: "long", day: "2-digit", month: "long" }
          );

          return (
            <details
              key={dateKey}
              open={dateKey === todayKey}
              className="rounded-xl bg-neutral-900"
            >
              <summary className="cursor-pointer px-4 py-3 font-medium text-white">
                {label} ({daySlots.length})
              </summary>

              <div className="p-4 space-y-3">
                {daySlots.map(slot => {
                  const slotBookings = getSlotBookings(slot.id);
                  const state = getSlotState(slot);

                  return (
                    <div
                      key={slot.id}
                      className={`rounded-lg p-3 ${stateStyles[state]}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <span className="font-medium">
                            {slot.timestamp.toDate().toLocaleTimeString(
                              "sr-RS",
                              { hour: "2-digit", minute: "2-digit" }
                            )}
                          </span>
                          <span className="text-sm font-medium text-neutral-300">
  {slotBookings.length} / {MAX_CAPACITY}
</span>
                          {slot.locked && (
                            <span className="text-xs text-red-400">
                              🔒 Zaključan
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <select
                            disabled={slot.locked}
                            onChange={e =>
                              adminBook(slot, e.target.value)
                            }
                            className="rounded bg-neutral-800 px-2 py-1 text-sm disabled:opacity-50"
                          >
                            <option value="">
                              Rezerviši
                            </option>
                            {users.map(u => (
                              <option key={u.id} value={u.id}>
                                {u.name} {u.surname}
                              </option>
                            ))}
                          </select>

                          <button
                            onClick={() => toggleLock(slot)}
                            className="text-xs text-neutral-400 hover:text-neutral-200">
                            {slot.locked ? "Otključaj" : "Zaključaј"}
                          </button>
                        </div>
                      </div>

                      <div className="mt-2 space-y-1">
                        {slotBookings.map(b => {
                          const u = users.find(
                            u => u.id === b.userId
                          );

                          return (
                            <div
                              key={b.id}
                              className="flex items-center gap-3 text-sm"
                            >
                              <Link
                                to={`/profil/${b.userId}`}
                                className="font-medium text-blue-400"
                              >
                                {u
                                  ? `${u.name} ${u.surname}`
                                  : b.userId}
                              </Link>

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
                                  Check-in
                                </button>
                              ) : (
                                <span className="text-green-500">
                                  Checked-in
                                </span>
                              )}

                              <button
                                onClick={() =>
                                  cancelBooking(b)
                                }
                                className="text-red-400"
                              >
                                Otkaži
                              </button>
                            </div>
                          );
                        })}
                      </div>
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
