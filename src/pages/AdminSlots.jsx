import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  updateDoc
} from "firebase/firestore";
import { db } from "../firebase";

const MAX_CAPACITY = 5;
const LATE_BOOKING_HOURS = 1;

export default function AdminSlots() {
  const [slots, setSlots] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Single slot creation
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  // Bulk creation
  const [bulkStartDate, setBulkStartDate] = useState("");
  const [bulkEndDate, setBulkEndDate] = useState("");
  const [bulkStartTime, setBulkStartTime] = useState("");
  const [bulkEndTime, setBulkEndTime] = useState("");
  const [bulkInterval, setBulkInterval] = useState(60);

  const [overbook, setOverbook] = useState(false);
  const [filterDate, setFilterDate] = useState(""); 

  // Bulk selection for update/delete
  const [selectedSlots, setSelectedSlots] = useState([]);

  // Copy slots
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

  function getSlotTimestamp(dateStr, timeStr) {
    if (!dateStr || !timeStr) return null;
    return new Date(`${dateStr}T${timeStr}:00`);
  }

  async function createSlot() {
    const ts = getSlotTimestamp(date, time);
    if (!ts) return alert("Unesite datum i vreme termina");

    await addDoc(collection(db, "slots"), { timestamp: ts });
    setDate(""); setTime("");
    loadData();
  }

  async function createBulkSlots() {
    if (!bulkStartDate || !bulkEndDate || !bulkStartTime || !bulkEndTime) {
      return alert("Popunite sve parametre za bulk kreiranje");
    }

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

  function isLateOrStarted(slot) {
    const now = new Date();
    const slotTime = slot.timestamp.toDate();
    return slotTime - now < 1000 * 60 * LATE_BOOKING_HOURS;
  }

  function getSlotColor(slot) {
    const slotBookings = bookings.filter(b => b.slotId === slot.id);
    const count = slotBookings.length;

    if (isLateOrStarted(slot)) return "#e2e3e5"; 
    if (count >= MAX_CAPACITY && !overbook) return "#f8d7da"; 
    if (count >= MAX_CAPACITY && overbook) return "#fff3cd"; 
    if (count >= MAX_CAPACITY - 1) return "#fff3cd"; 
    return "#d4edda"; 
  }

  async function adminBook(slotId, userId) {
    if (!userId) return;
    const slotBookings = bookings.filter(b => b.slotId === slotId);
    if (slotBookings.length >= MAX_CAPACITY && !overbook) return alert("Slot je pun.");
    await addDoc(collection(db, "bookings"), { slotId, userId, createdAt: new Date() });
    loadData();
  }

  async function cancelBooking(bookingId) {
    await deleteDoc(doc(db, "bookings", bookingId));
    loadData();
  }

  // Bulk selection handlers
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

  const updateSelectedSlotsTime = async (newTimeStr) => {
    if (!selectedSlots.length) return alert("Niste izabrali termine");
    const [hours, minutes] = newTimeStr.split(":").map(Number);

    await Promise.all(selectedSlots.map(async id => {
      const slotDoc = slots.find(s => s.id === id);
      if (!slotDoc) return;
      const ts = slotDoc.timestamp.toDate();
      ts.setHours(hours, minutes, 0, 0);
      await updateDoc(doc(db, "slots", id), { timestamp: ts });
    }));

    setSelectedSlots([]);
    loadData();
    alert("Termini ažurirani");
  }

  // COPY SLOTS
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

  // Group slots by date
  const groupedSlots = slots.reduce((acc, slot) => {
    const dateKey = slot.timestamp.toDate().toLocaleDateString("sr-RS", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(slot);
    return acc;
  }, {});

  const filteredGroupedSlots = filterDate ? { [filterDate]: groupedSlots[filterDate] || [] } : groupedSlots;
  const dateOptions = Object.keys(groupedSlots).sort();

  if (loading) return <p>Učitavanje termina...</p>;

  return (
    <div>
      <h2>Admin — Raspored</h2>

      <label style={{ display: "block", marginBottom: 20 }}>
        <input type="checkbox" checked={overbook} onChange={e => setOverbook(e.target.checked)} /> Dozvoli overbooking
      </label>

      {/* FILTER BY DATE */}
      <div style={{ marginBottom: 20 }}>
        <label>Prikaži datum: </label>
        <select value={filterDate} onChange={e => setFilterDate(e.target.value)}>
          <option value="">Svi datumi</option>
          {dateOptions.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {/* SINGLE SLOT CREATION */}
      <div style={{ marginBottom: 20, padding: 10, border: "1px solid #ccc" }}>
        <h3>Kreiraj novi termin</h3>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        <input type="time" value={time} onChange={e => setTime(e.target.value)} style={{ marginLeft: 10 }} />
        <button onClick={createSlot} style={{ marginLeft: 10 }}>Kreiraj termin</button>
      </div>

      {/* BULK CREATION */}
      <div style={{ marginBottom: 20, padding: 10, border: "1px solid #ccc" }}>
        <h3>Bulk kreiranje termina</h3>
        <input type="date" value={bulkStartDate} onChange={e => setBulkStartDate(e.target.value)} />{" "}
        <input type="date" value={bulkEndDate} onChange={e => setBulkEndDate(e.target.value)} />
        <input type="time" value={bulkStartTime} onChange={e => setBulkStartTime(e.target.value)} style={{ marginLeft: 10 }} />
        <input type="time" value={bulkEndTime} onChange={e => setBulkEndTime(e.target.value)} style={{ marginLeft: 10 }} />
        <input type="number" value={bulkInterval} onChange={e => setBulkInterval(Number(e.target.value))} style={{ width: 70, marginLeft: 10 }} /> min
        <button onClick={createBulkSlots} style={{ marginLeft: 10 }}>Kreiraj termine</button>
      </div>

      {/* COPY SLOTS */}
      <div style={{ marginBottom: 20, padding: 10, border: "1px solid #ccc" }}>
        <h3>Kopiraj termine</h3>
        <label>Sa datuma: </label>
        <input type="date" value={copyFromDate} onChange={e => setCopyFromDate(e.target.value)} style={{ marginLeft: 10 }} />
        <label style={{ marginLeft: 10 }}>Na datum: </label>
        <input type="date" value={copyToDate} onChange={e => setCopyToDate(e.target.value)} style={{ marginLeft: 10 }} />
        <button onClick={copySlots} style={{ marginLeft: 10 }}>Kopiraj</button>
      </div>

      {/* BULK UPDATE/DELETE */}
      <div style={{ marginBottom: 20, padding: 10, border: "1px solid #ccc" }}>
        <h3>Bulk update / delete</h3>
        <input type="time" placeholder="Novo vreme" onChange={e => updateSelectedSlotsTime(e.target.value)} />
        <button onClick={deleteSelectedSlots} style={{ marginLeft: 10 }}>Obriši izabrane</button>
      </div>

      {/* EXISTING SLOTS */}
      {Object.entries(filteredGroupedSlots).map(([dateKey, daySlots]) => (
        <details key={dateKey} open={false}>
          <summary style={{ fontWeight: "bold", cursor: "pointer" }}>📅 {dateKey} — {daySlots.length} termina</summary>
          {daySlots.map(slot => {
            const slotBookings = bookings.filter(b => b.slotId === slot.id);
            const count = slotBookings.length;
            const bgColor = getSlotColor(slot);
            const selected = selectedSlots.includes(slot.id);

            return (
              <div key={slot.id} style={{ borderBottom: "1px solid #ccc", padding: 8, backgroundColor: bgColor, marginBottom: 4 }}>
                <input type="checkbox" checked={selected} onChange={() => toggleSelectSlot(slot.id)} />
                <strong style={{ marginLeft: 6 }}>{slot.timestamp.toDate().toLocaleTimeString("sr-RS", { hour: "2-digit", minute: "2-digit" })}</strong>
                <div>{count}/{MAX_CAPACITY} booked</div>

                {/* BOOKINGS */}
                {slotBookings.map(b => {
                  const u = users.find(u => u.id === b.userId);
                  return <div key={b.id} style={{ marginLeft: 10 }}>👤 {u ? `${u.name} ${u.surname}` : b.userId} <button style={{ marginLeft: 10 }} onClick={() => cancelBooking(b.id)}>❌</button></div>;
                })}

                {/* ADMIN BOOK FOR CLIENT */}
                <select defaultValue="" onChange={e => adminBook(slot.id, e.target.value)} style={{ marginTop: 6 }}>
                  <option value="">Rezerviši za klijenta</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name} {u.surname}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </details>
      ))}
    </div>
  );
}
