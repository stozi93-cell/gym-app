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

    // Load all slots
    const slotSnap = await getDocs(query(collection(db, "slots"), orderBy("timestamp")));
    const slotData = slotSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    setSlots(slotData);

    // Load user bookings
    const bookingSnap = await getDocs(
      query(collection(db, "bookings"), where("userId", "==", auth.currentUser.uid))
    );
    const userBookings = bookingSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    setBookings(userBookings);

    // Count bookings per slot
    const allBookingsSnap = await getDocs(collection(db, "bookings"));
    const counts = {};
    allBookingsSnap.docs.forEach((b) => {
      const sid = b.data().slotId;
      counts[sid] = (counts[sid] || 0) + 1;
    });
    setBookingCounts(counts);

    setLoading(false);
  }

  function canBook(slotTimestamp) {
    const now = new Date();
    const slotTime = slotTimestamp.toDate();
    const diffHours = (slotTime.getTime() - now.getTime()) / (1000 * 60 * 60);
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

  if (loading) return <p>Učitavanje termina...</p>;

  const today = new Date();

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

  // Last visits (all past checked-in bookings)
  const lastVisits = bookings
    .filter((b) => b.checkedIn)
    .map((b) => {
      const slot = slots.find((s) => s.id === b.slotId);
      return slot ? slot.timestamp.toDate() : null;
    })
    .filter(Boolean)
    .sort((a, b) => b - a); // latest first

  // Future bookings (for display)
  const futureBookings = bookings
    .filter((b) => {
      const slot = slots.find((s) => s.id === b.slotId);
      return slot && slot.timestamp.toDate() >= today;
    })
    .map((b) => slots.find((s) => s.id === b.slotId))
    .filter(Boolean)
    .sort((a, b) => a.timestamp.toDate() - b.timestamp.toDate()); // earliest first

  // Helper to capitalize day
  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // Filter out past slots
  const futureSlots = slots.filter((slot) => slot.timestamp.toDate() >= today);

  // Group only future slots by date (with day names)
  const groupedSlots = futureSlots.reduce((acc, slot) => {
    const dateKey = capitalize(
      slot.timestamp.toDate().toLocaleDateString("sr-Latn-RS", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    );
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(slot);
    return acc;
  }, {});

  // Sort groupedSlots by actual date
  const sortedDates = Object.entries(groupedSlots).sort((a, b) => {
    const dateA = new Date(a[1][0].timestamp.toDate());
    const dateB = new Date(b[1][0].timestamp.toDate());
    return dateA - dateB;
  });

  // Today key to open by default
  const todayKey = sortedDates.find(([date, slots]) => {
    const slotDate = new Date(slots[0].timestamp.toDate());
    return (
      slotDate.getDate() === today.getDate() &&
      slotDate.getMonth() === today.getMonth() &&
      slotDate.getFullYear() === today.getFullYear()
    );
  })?.[0];

  // Helper for slot coloring
  function getSlotColor(slot) {
    const booked = bookings.some((b) => b.slotId === slot.id);
    const count = bookingCounts[slot.id] || 0;
    const full = count >= MAX_CAPACITY;
    const bookingAllowed = canBook(slot.timestamp);

    if (booked) return "#add8e6"; // blue = booked by client
    if (full) return "#ffeaea"; // red-ish = full
    if (!bookingAllowed) return "#fff0b3"; // orange-ish = reservation closed
    return "#eaffea"; // green = available
  }

  return (
    <div>
      <h2>Rezervacije</h2>

      <p>
        <b>Dolazaka ove nedelje:</b> {weeklyCheckins.length}
      </p>

      {lastVisits.length > 0 && (
        <ul>
          {lastVisits.map((d, i) => (
            <li key={i}>
              {capitalize(
                d.toLocaleDateString("sr-Latn-RS", {
                  weekday: "long",
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })
              )}
            </li>
          ))}
        </ul>
      )}

      {futureBookings.length > 0 && (
        <ul>
          {futureBookings.map((slot) => (
            <li key={slot.id} style={{ color: "#007bff" }}>
              {capitalize(
                slot.timestamp.toDate().toLocaleDateString("sr-Latn-RS", {
                  weekday: "long",
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })
              )}{" "}
              {slot.timestamp.toDate().toLocaleTimeString("sr-Latn-RS", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </li>
          ))}
        </ul>
      )}

      {sortedDates.map(([date, daySlots]) => (
        <details key={date} open={date === todayKey}>
          <summary style={{ fontWeight: "bold", cursor: "pointer" }}>📅 {date}</summary>

          {daySlots.map((slot) => {
            const booked = bookings.some((b) => b.slotId === slot.id);
            const count = bookingCounts[slot.id] || 0;
            const full = count >= MAX_CAPACITY;
            const bookingAllowed = canBook(slot.timestamp);

            return (
              <div
                key={slot.id}
                style={{
                  marginLeft: 20,
                  marginBottom: 6,
                  backgroundColor: getSlotColor(slot),
                  padding: "4px 6px",
                  borderRadius: 4,
                }}
              >
                {slot.timestamp.toDate().toLocaleTimeString("sr-Latn-RS", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {" — "}
                {count}/{MAX_CAPACITY}

                {!booked && !full && bookingAllowed && (
                  <button style={{ marginLeft: 10 }} onClick={() => book(slot.id, slot.timestamp)}>
                    Rezerviši
                  </button>
                )}

                {!booked && !full && !bookingAllowed && (
                  <span style={{ marginLeft: 10, color: "orange" }}>Rezervacija zatvorena</span>
                )}

                {booked && (
                  <button style={{ marginLeft: 10 }} onClick={() => cancel(slot.id)}>
                    Otkaži
                  </button>
                )}

                {!booked && full && <span style={{ marginLeft: 10, color: "red" }}>Popunjeno</span>}
              </div>
            );
          })}
        </details>
      ))}
    </div>
  );
}
