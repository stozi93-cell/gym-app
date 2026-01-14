import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import { startOfWeek, endOfWeek, isWithinInterval } from "date-fns";

const WINDOW_DAYS = 3;
const MAX_CAPACITY = 5;
const BOOKING_CUTOFF_HOURS = 1;

export default function Bookings() {
  const [slots, setSlots] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [bookingCounts, setBookingCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData(dateOverride) {
    setLoading(true);

    const start = dateOverride ?? new Date();
    const endDate = new Date(start);
    endDate.setDate(start.getDate() + WINDOW_DAYS);

    const slotSnap = await getDocs(
      query(
        collection(db, "slots"),
        where("timestamp", ">=", start),
        where("timestamp", "<=", endDate),
        orderBy("timestamp")
      )
    );

    const slotData = slotSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));
    setSlots(slotData);

    const slotIds = slotData.map((s) => s.id);

    const bookingSnap = await getDocs(
      query(
        collection(db, "bookings"),
        where("userId", "==", auth.currentUser.uid)
      )
    );

    const userBookings = bookingSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));
    setBookings(userBookings);

    const counts = {};
    if (slotIds.length > 0) {
      const CHUNK_SIZE = 10;
      for (let i = 0; i < slotIds.length; i += CHUNK_SIZE) {
        const chunk = slotIds.slice(i, i + CHUNK_SIZE);
        const snap = await getDocs(
          query(collection(db, "bookings"), where("slotId", "in", chunk))
        );
        snap.docs.forEach((b) => {
          const sid = b.data().slotId;
          counts[sid] = (counts[sid] || 0) + 1;
        });
      }
    }

    setBookingCounts(counts);
    setLoading(false);
  }

  function canBook(slotTimestamp) {
    const diffHours =
      (slotTimestamp.toDate().getTime() - Date.now()) /
      (1000 * 60 * 60);
    return diffHours >= BOOKING_CUTOFF_HOURS;
  }

  async function book(slotId, slotTimestamp) {
    if (!canBook(slotTimestamp)) {
      alert("Rezervacija nije moguća manje od 1h pre početka treninga.");
      return;
    }
    if (bookings.some((b) => b.slotId === slotId)) {
      alert("Već ste rezervisali ovaj trening.");
      return;
    }
    const count = bookingCounts[slotId] || 0;
    if (count >= MAX_CAPACITY) {
      alert("Trening je popunjen.");
      return;
    }

    await addDoc(collection(db, "bookings"), {
      slotId,
      userId: auth.currentUser.uid,
      createdAt: new Date(),
    });

    loadData(selectedDate);
  }

  async function cancel(slotId) {
    const b = bookings.find((b) => b.slotId === slotId);
    if (!b) return;
    await deleteDoc(doc(db, "bookings", b.id));
    loadData(selectedDate);
  }

  if (loading) return <p className="text-neutral-400">Učitavanje...</p>;

  function formatDate(d, opts) {
    return d.toLocaleDateString("sr-Latn-RS", opts);
  }

  function formatTime(d) {
    return d.toLocaleTimeString("sr-Latn-RS", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  const today = new Date();

  const weeklyDone = bookings.filter((b) => {
    if (!b.checkedIn) return false;
    const slot = slots.find((s) => s.id === b.slotId);
    if (!slot) return false;
    const d = slot.timestamp.toDate();
    return isWithinInterval(d, {
      start: startOfWeek(today, { weekStartsOn: 1 }),
      end: endOfWeek(today, { weekStartsOn: 1 }),
    });
  });

  const pastVisits = weeklyDone
    .map((b) => {
      const slot = slots.find((s) => s.id === b.slotId);
      return slot ? slot.timestamp.toDate() : null;
    })
    .filter(Boolean)
    .sort((a, b) => b - a);

  const futureBookings = bookings
    .map((b) => slots.find((s) => s.id === b.slotId))
    .filter((s) => s && s.timestamp.toDate() >= today)
    .sort((a, b) => a.timestamp.toDate() - b.timestamp.toDate());

  const nextTraining = futureBookings[0];
  const additionalBookings = futureBookings.slice(1);

  const groupedSlots = slots.reduce((acc, slot) => {
    const key = capitalize(
      formatDate(slot.timestamp.toDate(), {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    );
    acc[key] = acc[key] || [];
    acc[key].push(slot);
    return acc;
  }, {});

  const sortedDates = Object.entries(groupedSlots).sort(
    (a, b) =>
      a[1][0].timestamp.toDate() -
      b[1][0].timestamp.toDate()
  );

  return (
    <div className="space-y-4">
      {/* Sledeći trening – always open */}
      <div className="bg-neutral-800 ring-1 ring-neutral-700 rounded-xl px-4 py-3 space-y-3">
        <div>
          <div className="text-xs text-neutral-400">
            Sledeći trening
          </div>

          {nextTraining ? (
            <>
              <div className="text-2xl font-semibold leading-tight">
                {formatTime(nextTraining.timestamp.toDate())}
              </div>
              <div className="text-xs text-neutral-400">
                {capitalize(
                  formatDate(nextTraining.timestamp.toDate(), {
                    weekday: "long",
                    day: "2-digit",
                    month: "long",
                  })
                )}
              </div>
            </>
          ) : (
            <div className="text-sm text-red-400 mt-1">
              Nemate zakazanih treninga.
            </div>
          )}
        </div>

        {additionalBookings.length > 0 && (
          <div>
            <div className="text-xs font-medium mb-0.5 text-neutral-300">
              Dodatne rezervacije
            </div>
            <ul className="text-xs text-blue-400 space-y-0.5">
              {additionalBookings.map((s) => (
                <li key={s.id}>
                  {formatTime(s.timestamp.toDate())} —{" "}
                  {capitalize(
                    formatDate(s.timestamp.toDate(), {
                      weekday: "long",
                      day: "2-digit",
                      month: "long",
                    })
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <div className="text-xs font-medium mb-0.5 text-neutral-300">
            Odrađeni treninzi ove nedelje:{" "}
          </div>

          {pastVisits.length > 0 && (
            <ul className="text-xs text-green-500 space-y-0.5">
              {pastVisits.map((d, i) => (
                <li key={i}>
                  {formatTime(d)} —{" "}
                  {capitalize(
                    formatDate(d, {
                      weekday: "long",
                      day: "2-digit",
                      month: "long",
                    })
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Slots (next 3 days) */}
      <div className="space-y-2">
        {sortedDates.map(([date, daySlots]) => (
          <details
            key={date}
            className="bg-neutral-900 border-l-4 border-neutral-600 pl-2 rounded-xl px-3 py-2"
          >
            <summary className="font-medium cursor-pointer text-sm leading-tight pl-1">
              {date}
            </summary>

            <div className="mt-2 space-y-2">
              {daySlots.map((slot) => {
                const booked = bookings.some(
                  (b) => b.slotId === slot.id
                );
                const count = bookingCounts[slot.id] || 0;
                const full = count >= MAX_CAPACITY;
                const allowed = canBook(slot.timestamp);

                return (
                  <div
                    key={slot.id}
                    className="flex justify-between items-center bg-neutral-800 rounded-lg px-3 py-1.5"
                  >
                    <span className="text-sm">
                      {formatTime(slot.timestamp.toDate())} —{" "}
                      <span className="text-neutral-400">
                        {count}/{MAX_CAPACITY}
                      </span>
                    </span>

                    {!booked && !full && allowed && (
                      <button
                        className="text-sm text-green-400"
                        onClick={() =>
                          book(slot.id, slot.timestamp)
                        }
                      >
                        Rezerviši
                      </button>
                    )}

                    {booked && (
                      <button
                        className="text-sm text-red-400"
                        onClick={() => cancel(slot.id)}
                      >
                        Otkaži
                      </button>
                    )}

                    {!booked && full && (
                      <span className="text-xs text-red-400">
                        Popunjeno
                      </span>
                    )}

                    {!booked && !allowed && !full && (
                      <span className="text-xs text-amber-400">
                        Zatvoreno
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </details>
        ))}
      </div>

      {/* Calendar escape hatch */}
      <div className="bg-neutral-900 rounded-xl p-3">
        <label className="text-xs text-neutral-400 block mb-1">
          Izaberi drugi datum
        </label>
        <input
          type="date"
          className="w-full bg-neutral-800 text-white rounded-lg p-2"
          onChange={(e) => {
            const d = new Date(e.target.value);
            setSelectedDate(d);
            loadData(d);
          }}
        />
      </div>
    </div>
  );
}
