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

    // Load slots
    const slotSnap = await getDocs(
      query(collection(db, "slots"), orderBy("timestamp"))
    );

    const slotData = slotSnap.docs.map(d => ({
      id: d.id,
      ...d.data(),
    }));
    setSlots(slotData);

    // Load user bookings
    const bookingSnap = await getDocs(
      query(
        collection(db, "bookings"),
        where("userId", "==", auth.currentUser.uid)
      )
    );

    const userBookings = bookingSnap.docs.map(d => ({
      id: d.id,
      ...d.data(),
    }));
    setBookings(userBookings);

    // Count bookings per slot
    const allBookings = await getDocs(collection(db, "bookings"));
    const counts = {};
    allBookings.docs.forEach(b => {
      const sid = b.data().slotId;
      counts[sid] = (counts[sid] || 0) + 1;
    });

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

    if (bookings.some(b => b.slotId === slotId)) {
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
    const b = bookings.find(b => b.slotId === slotId);
    if (!b) return;

    await deleteDoc(doc(db, "bookings", b.id));
    loadData();
  }

  if (loading) return <p>Učitavanje termina...</p>;

  // Group slots by date
  const groupedSlots = slots.reduce((acc, slot) => {
    const dateKey = slot.timestamp
      .toDate().toLocaleDateString("sr-RS", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(slot);
    return acc;
  }, {});

  return (
    <div>
      <h2>Rezervacije</h2>

      {Object.entries(groupedSlots).map(([date, daySlots]) => (
        <details key={date} open>
          <summary style={{ fontWeight: "bold", cursor: "pointer" }}>
            📅 {date}
          </summary>

          {daySlots.map(slot => {
            const booked = bookings.some(b => b.slotId === slot.id);
            const count = bookingCounts[slot.id] || 0;
            const full = count >= MAX_CAPACITY;
            const bookingAllowed = canBook(slot.timestamp);

            return (
              <div key={slot.id} style={{ marginLeft: 20, marginBottom: 6 }}>
                {slot.timestamp.toDate().toLocaleTimeString("sr-RS", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {" — "}
                {count}/{MAX_CAPACITY}

                {!booked && !full && bookingAllowed && (
                  <button
                    style={{ marginLeft: 10 }}
                    onClick={() => book(slot.id, slot.timestamp)}
                  >
                    Rezerviši
                  </button>
                )}

                {!booked && !full && !bookingAllowed && (
                  <span style={{ marginLeft: 10, color: "orange" }}>
                    Rezervacija zatvorena
                  </span>
                )}

                {booked && (
                  <button
                    style={{ marginLeft: 10 }}
                    onClick={() => cancel(slot.id)}
                  >
                    Otkaži
                  </button>
                )}

                {!booked && full && (
                  <span style={{ marginLeft: 10, color: "red" }}>
                    Popunjeno
                  </span>
                )}
              </div>
            );
          })}
        </details>
      ))}
    </div>
  );
}
