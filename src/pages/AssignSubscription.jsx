import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  doc,
  getDoc
} from "firebase/firestore";
import { db } from "../firebase";
import { useParams } from "react-router-dom";

export default function AssignSubscription() {
  const { uid } = useParams(); // may be undefined
  const [users, setUsers] = useState([]);
  const [packages, setPackages] = useState([]);
  const [userId, setUserId] = useState(uid || "");
  const [packageId, setPackageId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [checkInOption, setCheckInOption] = useState("default");
  const [currentSubs, setCurrentSubs] = useState([]);

  const checkInOptions = [
    { value: "default", label: "Koristi podrazumevano iz paketa" },
    { value: "1", label: "Jednom nedeljno" },
    { value: "2", label: "Dva puta nedeljno" },
    { value: "3", label: "Tri puta nedeljno" },
    { value: "4", label: "Četiri puta nedeljno" },
    { value: "5", label: "Pet puta nedeljno" },
    { value: "unlimited", label: "Neograničeno" },
  ];

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

  useEffect(() => {
    if (uid) setUserId(uid);
  }, [uid]);

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

    // Load active subscriptions/packages
const pSnap = await getDocs(
  query(collection(db, "subscriptions"), where("active", "==", true))
);

let packagesArr = pSnap.docs.map(d => ({ id: d.id, ...d.data() }));

// SORT BY 'order' FIELD
packagesArr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

setPackages(packagesArr);

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
      const pkgSnap = await getDoc(doc(db, "subscriptions", subData.subscriptionId));
      const pkg = pkgSnap.data();
      if (pkg) {
        const start = subData.startDate?.toDate ? subData.startDate.toDate() : new Date(subData.startDate);
        const end = subData.endDate?.toDate ? subData.endDate.toDate() : new Date(subData.endDate);

        subs.push({
          ...pkg,
          startDate: start,
          endDate: end,
          checkIns: subData.checkIns || [],
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

    // Determine weekly check-ins
    let weeklyCheckIns = checkInOption;
    if (checkInOption === "default") {
      weeklyCheckIns = pkg.defaultCheckIns || "unlimited";
    }

    // Initialize check-ins array per week
    const weeks = Math.ceil((end - start) / (7 * 24 * 60 * 60 * 1000));
    const checkInsArray = [];
    for (let i = 0; i < weeks; i++) {
      checkInsArray.push(weeklyCheckIns === "unlimited" ? "unlimited" : 0);
    }

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
      weeklyCheckIns,
      checkInsArray,
    });

    alert("Pretplata dodeljena");
    setUserId(uid || "");
    setPackageId("");
    setStartDate("");
    setCheckInOption("default");
    setCurrentSubs([]);
  }

  const formatDate = (d) =>
    d?.toDate
      ? d.toDate().toLocaleDateString("sr-Latn-RS", { day: "2-digit", month: "long", year: "numeric" })
      : d instanceof Date
      ? d.toLocaleDateString("sr-Latn-RS", { day: "2-digit", month: "long", year: "numeric" })
      : "—";

  return (
    <div>
      <h2>Dodeli pretplatu klijentu</h2>

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

      {currentSubs.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <b>Trenutne aktivne pretplate:</b>
          <ul>
            {currentSubs.map((s, i) => (
              <li key={i}>
                {s.name} — {formatDate(s.startDate)} – {formatDate(s.endDate)}
              </li>
            ))}
          </ul>
        </div>
      )}

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

      <div style={{ marginBottom: 10 }}>
        <label>Izaberite broj dolazaka nedeljno:</label>
        <select value={checkInOption} onChange={e => setCheckInOption(e.target.value)}>
          {checkInOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 10 }}>
        <label>Datum početka (opciono):</label>
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
      </div>

      <button onClick={assign}>Dodeli</button>
    </div>
  );
}
