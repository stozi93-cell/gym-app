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

const WINDOW_DAYS = 7;
const MAX_CAPACITY = 5;
const BOOKING_CUTOFF_HOURS = 1;

export default function Bookings() {
  const [slots, setSlots] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [bookingCounts, setBookingCounts] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
  setLoading(true);

  const now = new Date();
  const endDate = new Date();
  endDate.setDate(now.getDate() + WINDOW_DAYS);

  // 1️⃣ Load slots ONLY for rolling window
  const slotSnap = await getDocs(
    query(
      collection(db, "slots"),
      where("timestamp", ">=", now),
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

  // 2️⃣ Load ONLY current user's bookings
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

  // 3️⃣ Load bookings ONLY for visible slots (capacity counts)
  const counts = {};

  if (slotIds.length > 0) {
    // Firestore "in" limit is 10 → chunk safely
    const CHUNK_SIZE = 10;

    for (let i = 0; i < slotIds.length; i += CHUNK_SIZE) {
      const chunk = slotIds.slice(i, i + CHUNK_SIZE);

      const snap = await getDocs(
        query(
          collection(db, "bookings"),
          where("slotId", "in", chunk)
        )
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
    const now = new Date();
    const slotTime = slotTimestamp.toDate();
    const diffHours =
      (slotTime.getTime() - now.getTime()) / (1000 * 60 * 60);
    return diffHours >= BOOKING_CUTOFF_HOURS;
  }

  async function book(slotId, slotTimestamp) {
    if (!canBook(slotTimestamp)) {
      alert("Rezervacija nije moguća manje od 1h pre početka termina.");
      return;
    }
    if (bookings.some((b) => b.slotId === slotId)) {
      alert("Već ste rezervisali ovaj termin.");
      return;
    }
    const count = bookingCounts[slotId] || 0;
    if (count >= MAX_CAPACITY) {
      alert("Termin je popunjen.");
      return;
    }

    await addDoc(collection(db, "bookings"), {
      slotId,
      userId: auth.currentUser.uid,
      createdAt: new Date(),
    });

    loadData();
  }

  async function cancel(slotId) {
    const b = bookings.find((b) => b.slotId === slotId);
    if (!b) return;
    await deleteDoc(doc(db, "bookings", b.id));
    loadData();
  }

  if (loading) return <p className="text-neutral-400">Učitavanje...</p>;

  const today = new Date();

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

  // Weekly check-ins
  const weeklyCheckins = bookings.filter((b) => {
    if (!b.checkedIn) return false;
    const slot = slots.find((s) => s.id === b.slotId);
    if (!slot) return false;
    const slotDate = slot.timestamp.toDate();
    return isWithinInterval(slotDate, {
      start: startOfWeek(today, { weekStartsOn: 1 }),
      end: endOfWeek(today, { weekStartsOn: 1 }),
    });
  });

  // Past visits
  const pastVisits = bookings
    .filter((b) => b.checkedIn)
    .map((b) => {
      const slot = slots.find((s) => s.id === b.slotId);
      return slot ? slot.timestamp.toDate() : null;
    })
    .filter(Boolean)
    .sort((a, b) => b - a);

  // Future bookings
  const futureBookings = bookings
    .map((b) => slots.find((s) => s.id === b.slotId))
    .filter((s) => s && s.timestamp.toDate() >= today)
    .sort((a, b) => a.timestamp.toDate() - b.timestamp.toDate());

  const primaryBooking = futureBookings[0];

  // Group future slots
  const futureSlots = slots.filter(
    (s) => s.timestamp.toDate() >= today
  );

  const groupedSlots = futureSlots.reduce((acc, slot) => {
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
      a[1][0].timestamp.toDate() - b[1][0].timestamp.toDate()
  );

  const todayKey = sortedDates.find(([_, s]) => {
    const d = s[0].timestamp.toDate();
    return (
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear()
    );
  })?.[0];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-neutral-900 rounded-xl p-4">
        <h2 className="text-lg font-semibold">Rezervacije</h2>
        <p className="text-sm text-neutral-400">
          Ove nedelje: <b>{weeklyCheckins.length}</b> dolazaka
        </p>
        {pastVisits[0] && (
          <p className="text-xs text-neutral-500">
            Poslednji trening:{" "}
            {capitalize(
              formatDate(pastVisits[0], {
                weekday: "short",
                day: "2-digit",
                month: "short",
              })
            )}
          </p>
        )}
      </div>

      {/* Today / Next */}
      <div className="bg-neutral-800 rounded-xl p-4">
        <h3 className="text-sm font-medium mb-2">
          {primaryBooking ? "Sledeći termin" : "Nema zakazanih termina"}
        </h3>
        {primaryBooking ? (
          <>
            <div className="text-2xl font-semibold">
              {formatTime(primaryBooking.timestamp.toDate())}
            </div>
            <div className="text-sm text-neutral-400">
              {capitalize(
                formatDate(primaryBooking.timestamp.toDate(), {
                  weekday: "long",
                  day: "2-digit",
                  month: "long",
                })
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-neutral-400">
            Slobodno rezervišite novi termin ispod.
          </p>
        )}
      </div>

      {/* Upcoming list */}
      {futureBookings.length > 1 && (
        <div className="bg-neutral-900 rounded-xl p-4">
          <h3 className="text-sm font-medium mb-2">
            Predstojeće rezervacije
          </h3>
          <ul className="space-y-1 text-sm">
            {futureBookings.slice(1, 4).map((s) => (
              <li key={s.id} className="text-blue-400">
                {formatTime(s.timestamp.toDate())} —{" "}
                {capitalize(
                  formatDate(s.timestamp.toDate(), {
                    weekday: "short",
                    day: "2-digit",
                    month: "short",
                  })
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Available slots */}
      <div className="space-y-2">
        {sortedDates.map(([date, daySlots]) => (
          <details
            key={date}
            open={date === todayKey}
            className="bg-neutral-900 rounded-xl p-3"
          >
            <summary className="font-medium cursor-pointer">
              📅 {date}
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
                    className="flex justify-between items-center bg-neutral-800 rounded-lg px-3 py-2"
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

      {/* Past visits */}
      {pastVisits.length > 0 && (
        <details className="bg-neutral-900 rounded-xl p-3">
          <summary className="font-medium cursor-pointer text-neutral-400">
            Prošli treninzi
          </summary>
          <ul className="mt-2 text-sm text-neutral-500 space-y-1">
            {pastVisits.map((d, i) => (
              <li key={i}>
                {capitalize(
                  formatDate(d, {
                    weekday: "long",
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
