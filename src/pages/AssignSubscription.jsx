import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  doc
} from "firebase/firestore";
import { db } from "../firebase";

export default function AssignSubscription() {
  const [users, setUsers] = useState([]);
  const [packages, setPackages] = useState([]);
  const [userId, setUserId] = useState("");
  const [packageId, setPackageId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [currentSubs, setCurrentSubs] = useState([]);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (userId) {
      loadCurrentSubs(userId);
    } else {
      setCurrentSubs([]);
    }
  }, [userId]);

  async function load() {
    // Load active clients only
    const uSnap = await getDocs(
      query(
        collection(db, "users"),
        where("role", "==", "client"),
        where("active", "==", true)
      )
    );
    setUsers(uSnap.docs.map(d => ({ id: d.id, ...d.data() })));

    // Load active subscriptions
    const pSnap = await getDocs(
      query(collection(db, "subscriptions"), where("active", "==", true))
    );
    setPackages(pSnap.docs.map(d => ({ id: d.id, ...d.data() })));
  }

  async function loadCurrentSubs(uid) {
    const snap = await getDocs(
      query(
        collection(db, "clientSubscriptions"),
        where("userId", "==", uid),
        where("active", "==", true)
      )
    );

    const subs = [];
    for (const d of snap.docs) {
      const subData = d.data();
      const pkgSnap = await getDocs(
        query(collection(db, "subscriptions"), where("__name__", "==", subData.subscriptionId))
      );
      const pkg = pkgSnap.docs[0]?.data();
      if (pkg) {
        // Normalize dates to always work
        const start = subData.startDate?.toDate ? subData.startDate.toDate() : new Date(subData.startDate);
        const end = subData.endDate?.toDate ? subData.endDate.toDate() : new Date(subData.endDate);

        subs.push({
          ...pkg,
          startDate: start,
          endDate: end,
        });
      }
    }

    setCurrentSubs(subs);
  }

  async function assign() {
    if (!userId || !packageId) {
      alert("Sva polja su obavezna");
      return;
    }

    const pkg = packages.find(p => p.id === packageId);
    const start = startDate ? new Date(startDate) : new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + (pkg.durationDays || 30));

    // Deactivate existing subscriptions for this client
    const existing = await getDocs(
      query(
        collection(db, "clientSubscriptions"),
        where("userId", "==", userId),
        where("active", "==", true)
      )
    );

    for (const d of existing.docs) {
      await updateDoc(doc(db, "clientSubscriptions", d.id), { active: false });
    }

    // Assign new subscription
    await addDoc(collection(db, "clientSubscriptions"), {
      userId,
      subscriptionId: packageId,
      startDate: start,
      endDate: end,
      active: true,
    });

    alert("Pretplata dodeljena");
    setUserId("");
    setPackageId("");
    setStartDate("");
    setCurrentSubs([]);
  }

  return (
    <div>
      <h2>Dodeli pretplatu klijentu</h2>

      {/* Client selection */}
      <div style={{ marginBottom: 10 }}>
        <label>Izaberite klijenta:</label>
        <select value={userId} onChange={e => setUserId(e.target.value)}>
          <option value="">-- Odaberite klijenta --</option>
          {users.map(u => (
            <option key={u.id} value={u.id}>
              {u.name} {u.surname} ({u.email})
            </option>
          ))}
        </select>
      </div>

      {/* Show current subscriptions */}
      {currentSubs.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <b>Trenutne aktivne pretplate:</b>
          <ul>
            {currentSubs.map((s, i) => (
              <li key={i}>
                {s.name} —{" "}
                {s.startDate.toLocaleDateString("sr-RS", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}{" "}
                –{" "}
                {s.endDate.toLocaleDateString("sr-RS", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Subscription selection */}
      <div style={{ marginBottom: 10 }}>
        <label>Izaberite pretplatu:</label>
        <select value={packageId} onChange={e => setPackageId(e.target.value)}>
          <option value="">-- Odaberite pretplatu --</option>
          {packages.map(p => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.durationDays || 30} dana)
            </option>
          ))}
        </select>
      </div>

      {/* Start date */}
      <div style={{ marginBottom: 10 }}>
        <label>Datum početka (opciono):</label>
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
      </div>

      <button onClick={assign}>Dodeli</button>
    </div>
  );
}
