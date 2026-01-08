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
  where
} from "firebase/firestore";
import { Link } from "react-router-dom";
import { db } from "../firebase";

const MAX_CAPACITY = 5;
const LATE_BOOKING_HOURS = 1;

export default function AdminSlots() {
  const [slots, setSlots] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  const [bulkStartDate, setBulkStartDate] = useState("");
  const [bulkEndDate, setBulkEndDate] = useState("");
  const [bulkStartTime, setBulkStartTime] = useState("");
  const [bulkEndTime, setBulkEndTime] = useState("");
  const [bulkInterval, setBulkInterval] = useState(60);

  const [overbook, setOverbook] = useState(false);
  const [filterDate, setFilterDate] = useState("");

  const [selectedSlots, setSelectedSlots] = useState([]);

  const [copyFromDate, setCopyFromDate] = useState("");
  const [copyToDate, setCopyToDate] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);

    const slotSnap = await getDocs(query(collection(db, "slots"), orderBy("timestamp")));
    setSlots(slotSnap.docs.map(d => ({ id: d.id, ...d.data() })));

    const bookingSnap = await getDocs(collection(db, "bookings"));
    setBookings(bookingSnap.docs.map(d => ({ id: d.id, ...d.data() })));

    const userSnap = await getDocs(collection(db, "users"));
    setUsers(userSnap.docs.map(d => ({ id: d.id, ...d.data() })));

    setLoading(false);
  }

  function getSlotColor(slot) {
    const now = new Date();
    const slotTime = slot.timestamp.toDate();
    const isPast = slotTime < now;
    const slotBookings = bookings.filter(b => b.slotId === slot.id);
    const count = slotBookings.length;

    if (isPast) return "#e2e3e5"; // past slots greyed
    if (count >= MAX_CAPACITY && !overbook) return "#f8d7da"; 
    if (count >= MAX_CAPACITY && overbook) return "#fff3cd"; 
    if (count >= MAX_CAPACITY - 1) return "#fff3cd"; 
    return "#d4edda"; 
  }

  async function adminBook(slotId, userId) {
    if (!userId) return;
    const slotBookings = bookings.filter(b => b.slotId === slotId);
    if (slotBookings.length >= MAX_CAPACITY && !overbook) return alert("Slot je pun.");

    await addDoc(collection(db, "bookings"), {
      slotId,
      userId,
      createdAt: new Date(),
      checkedIn: false
    });
    loadData();
  }

  async function handleCheckIn(booking, slotTimestamp) {
    if (booking.checkedIn) return;

    await updateDoc(doc(db, "bookings", booking.id), {
      checkedIn: true,
      checkedInAt: new Date()
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
    const weekIndex = Math.floor((checkDate - start) / (7 * 24 * 60 * 60 * 1000));

    const arr = sub.checkInsArray || [];
    arr[weekIndex] = (arr[weekIndex] || 0) + 1;

    await updateDoc(doc(db, "clientSubscriptions", subDoc.id), {
      checkInsArray: arr
    });

    loadData();
  }

  async function cancelBooking(booking) {
    await deleteDoc(doc(db, "bookings", booking.id));

    // Remove check-in from subscription if previously checked in
    if (booking.checkedIn) {
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
      const checkDate = booking.slotTimestamp.toDate ? booking.slotTimestamp.toDate() : new Date(booking.slotTimestamp);
      const weekIndex = Math.floor((checkDate - start) / (7 * 24 * 60 * 60 * 1000));

      const arr = sub.checkInsArray || [];
      arr[weekIndex] = (arr[weekIndex] || 1) - 1;
      if (arr[weekIndex] < 0) arr[weekIndex] = 0;

      await updateDoc(doc(db, "clientSubscriptions", subDoc.id), {
        checkInsArray: arr
      });
    }

    loadData();
  }

  const toggleSelectSlot = (slotId) => {
    setSelectedSlots(prev => prev.includes(slotId) ? prev.filter(id => id !== slotId) : [...prev, slotId]);
  }

  const deleteSelectedSlots = async () => {
    if (!selectedSlots.length) return alert("Niste izabrali termine");
    if (!window.confirm(`Obrisati ${selectedSlots.length} termina?`)) return;

    await Promise.all(selectedSlots.map(id => deleteDoc(doc(db, "slots", id))));
    setSelectedSlots([]);
    loadData();
  }

  // --- SLOT CREATION FUNCTIONS (restored) ---
  function getSlotTimestamp(dateStr, timeStr) {
    if (!dateStr || !timeStr) return null;
    return new Date(`${dateStr}T${timeStr}:00`);
  }

  const createSlot = async () => {
    const ts = getSlotTimestamp(date, time);
    if (!ts) return alert("Unesite datum i vreme termina");
    await addDoc(collection(db, "slots"), { timestamp: ts });
    setDate(""); setTime("");
    loadData();
  }

  const createBulkSlots = async () => {
    if (!bulkStartDate || !bulkEndDate || !bulkStartTime || !bulkEndTime) return alert("Popunite sve parametre za bulk kreiranje");

    const startDay = new Date(bulkStartDate);
    const endDay = new Date(bulkEndDate);

    const [startHour, startMin] = bulkStartTime.split(":").map(Number);
    const [endHour, endMin] = bulkEndTime.split(":").map(Number);

    const slotsToCreate = [];
    for (let d = new Date(startDay); d <= endDay; d.setDate(d.getDate() + 1)) {
      let current = new Date(d); current.setHours(startHour, startMin, 0, 0);
      const end = new Date(d); end.setHours(endHour, endMin, 0, 0);

      while (current <= end) {
        slotsToCreate.push(new Date(current));
        current = new Date(current.getTime() + bulkInterval * 60000);
      }
    }

    await Promise.all(slotsToCreate.map(ts => addDoc(collection(db, "slots"), { timestamp: ts })));
    setBulkStartDate(""); setBulkEndDate(""); setBulkStartTime(""); setBulkEndTime(""); setBulkInterval(60);
    loadData();
    alert(`${slotsToCreate.length} termina kreirano`);
  }

  const copySlots = async () => {
    if (!copyFromDate || !copyToDate) return alert("Popunite oba datuma");

    const fromDateSlots = slots.filter(slot => slot.timestamp.toDate().toISOString().split("T")[0] === copyFromDate);
    if (!fromDateSlots.length) return alert("Nema termina za kopiranje");

    const toDate = new Date(copyToDate);

    await Promise.all(fromDateSlots.map(slot => {
      const tsOld = slot.timestamp.toDate();
      const tsNew = new Date(toDate);
      tsNew.setHours(tsOld.getHours(), tsOld.getMinutes(), 0, 0);
      return addDoc(collection(db, "slots"), { timestamp: tsNew });
    }));

    setCopyFromDate(""); setCopyToDate("");
    loadData();
    alert(`${fromDateSlots.length} termina kopirano na ${copyToDate}`);
  }

  // --- END CREATION FUNCTIONS ---

  const groupedSlots = slots.reduce((acc, slot) => {
    const d = slot.timestamp.toDate();
    const key = d.toISOString().split("T")[0];
    if (!acc[key]) acc[key] = [];
    acc[key].push(slot);
    return acc;
  }, {});

  const todayKey = new Date().toISOString().split("T")[0];
  const filteredGroupedSlots = filterDate
    ? { [filterDate]: groupedSlots[filterDate] || [] }
    : groupedSlots;

  if (loading) return <p>Učitavanje termina...</p>;

  return (
    <div>
      <h2>Admin — Raspored</h2>

      <label>
        <input type="checkbox" checked={overbook} onChange={e => setOverbook(e.target.checked)} /> Dozvoli overbooking
      </label>

      {/* Filter by date */}
      <div style={{ marginBottom: 20 }}>
        <label>Prikaži datum: </label>
        <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} />
        {filterDate && <button onClick={() => setFilterDate("")}>Reset</button>}
      </div>

      {/* --- Slot creation UI --- */}
      <div style={{ border: "1px solid #ccc", padding: 10, marginBottom: 20 }}>
        <h3>Kreiraj termin</h3>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        <input type="time" value={time} onChange={e => setTime(e.target.value)} style={{ marginLeft: 10 }} />
        <button onClick={createSlot} style={{ marginLeft: 10 }}>Kreiraj</button>
      </div>

      <div style={{ border: "1px solid #ccc", padding: 10, marginBottom: 20 }}>
        <h3>Bulk kreiranje termina</h3>
        <input type="date" value={bulkStartDate} onChange={e => setBulkStartDate(e.target.value)} />{" "}
        <input type="date" value={bulkEndDate} onChange={e => setBulkEndDate(e.target.value)} />
        <input type="time" value={bulkStartTime} onChange={e => setBulkStartTime(e.target.value)} style={{ marginLeft: 10 }} />
        <input type="time" value={bulkEndTime} onChange={e => setBulkEndTime(e.target.value)} style={{ marginLeft: 10 }} />
        <input type="number" value={bulkInterval} onChange={e => setBulkInterval(Number(e.target.value))} style={{ width: 70, marginLeft: 10 }} /> min
        <button onClick={createBulkSlots} style={{ marginLeft: 10 }}>Kreiraj termine</button>
      </div>

      <div style={{ border: "1px solid #ccc", padding: 10, marginBottom: 20 }}>
        <h3>Kopiraj termine</h3>
        <label>Sa datuma: </label>
        <input type="date" value={copyFromDate} onChange={e => setCopyFromDate(e.target.value)} style={{ marginLeft: 10 }} />
        <label style={{ marginLeft: 10 }}>Na datum: </label>
        <input type="date" value={copyToDate} onChange={e => setCopyToDate(e.target.value)} style={{ marginLeft: 10 }} />
        <button onClick={copySlots} style={{ marginLeft: 10 }}>Kopiraj</button>
      </div>

      {/* Bulk delete */}
      <div style={{ border: "1px solid #ccc", padding: 10, marginBottom: 20 }}>
        <h3>Bulk delete</h3>
        <button onClick={deleteSelectedSlots}>Obriši izabrane</button>
      </div>

      {/* Slots display */}
      {Object.entries(filteredGroupedSlots).map(([dateKey, daySlots]) => (
        <details key={dateKey} open={dateKey === todayKey}>
          <summary style={{ fontWeight: "bold", cursor: "pointer" }}>
            📅 {dateKey} — {daySlots.length} termina
          </summary>

          {daySlots.map(slot => {
            const slotBookings = bookings.filter(b => b.slotId === slot.id);
            const bgColor = getSlotColor(slot);
            const isPast = slot.timestamp.toDate() < new Date();

            return (
              <div key={slot.id} style={{ padding: 8, marginBottom: 6, backgroundColor: bgColor }}>
                <input type="checkbox" checked={selectedSlots.includes(slot.id)} onChange={() => toggleSelectSlot(slot.id)} />
                <strong>
                  {slot.timestamp.toDate().toLocaleTimeString("sr-RS", { hour: "2-digit", minute: "2-digit" })}
                </strong>

                {slotBookings.map(b => {
                  const u = users.find(u => u.id === b.userId);
                  return (
                    <div key={b.id} style={{ marginLeft: 10, opacity: isPast ? 0.7 : 1 }}>
                      👤{" "}
                      <Link to={`/profil/${b.userId}`} target="_blank" style={{ fontWeight: "bold" }}>
                        {u ? `${u.name} ${u.surname}` : b.userId}
                      </Link>

                      {!b.checkedIn ? (
                        <button style={{ marginLeft: 10 }} onClick={() => handleCheckIn(b, slot.timestamp)}>✅ Check-in</button>
                      ) : (
                        <span style={{ marginLeft: 10, color: "green" }}>✔️ Checked-in</span>
                      )}

                      <button style={{ marginLeft: 10 }} onClick={() => cancelBooking({ ...b, slotTimestamp: slot.timestamp })}>❌ Otkaži</button>
                    </div>
                  );
                })}

                <select defaultValue="" onChange={e => adminBook(slot.id, e.target.value)} style={{ marginTop: 6 }}>
                  <option value="">Rezerviši za klijenta</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name} {u.surname}</option>)}
                </select>
              </div>
            );
          })}
        </details>
      ))}
    </div>
  );
}
