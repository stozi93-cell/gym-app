import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  query,
  where,
  getDoc
} from "firebase/firestore";
import { db } from "../firebase";
import { useSearchParams } from "react-router-dom";

export default function AdminPackages() {
  // --- Packages state ---
  const [packages, setPackages] = useState([]);
  const [newPackage, setNewPackage] = useState({
    name: "",
    durationDays: "",
    price: "",
    defaultCheckIns: "default",
  });

  const checkInOptions = [
    { value: "default", label: "Koristi podrazumevano" },
    { value: "1", label: "Jednom nedeljno" },
    { value: "2", label: "Dva puta nedeljno" },
    { value: "3", label: "Tri puta nedeljno" },
    { value: "4", label: "Četiri puta nedeljno" },
    { value: "5", label: "Pet puta nedeljno" },
    { value: "unlimited", label: "Neograničeno" },
  ];

  // --- Assignment state ---
  const [users, setUsers] = useState([]);
  const [userId, setUserId] = useState("");
  const [packageId, setPackageId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [checkInOption, setCheckInOption] = useState("default");
  const [currentSubs, setCurrentSubs] = useState([]);

  // --- Handle query param for client preselection ---
  const [searchParams] = useSearchParams();
  const clientIdFromParam = searchParams.get("clientId");

  useEffect(() => {
    loadPackages();
    loadClients();
  }, []);

  useEffect(() => {
  if (userId) loadCurrentSubs(userId);
  else setCurrentSubs([]); // ALWAYS array
}, [userId]);

  useEffect(() => {
    if (clientIdFromParam) setUserId(clientIdFromParam);
  }, [clientIdFromParam]);

  // ---------------- Packages ----------------
  async function loadPackages() {
    const snap = await getDocs(collection(db, "subscriptions"));
    let data = snap.docs.map((d, i) => ({ id: d.id, ...d.data() }));
    data = data.map((p, i) => ({ ...p, order: p.order ?? i }));
    data.sort((a, b) => a.order - b.order);
    setPackages(data);
  }

  async function createPackage() {
    const { name, durationDays, price, defaultCheckIns } = newPackage;
    if (!name || !durationDays || !price) return alert("Popunite sva polja");

    const newOrder = packages.length;
    await addDoc(collection(db, "subscriptions"), {
      name,
      durationDays: Number(durationDays),
      price: Number(price),
      defaultCheckIns,
      active: true,
      order: newOrder,
    });

    setNewPackage({ name: "", durationDays: "", price: "", defaultCheckIns: "default" });
    loadPackages();
  }

  async function toggleActive(pkg) {
    await updateDoc(doc(db, "subscriptions", pkg.id), { active: !pkg.active });
    loadPackages();
  }

  async function updatePackage(pkgId, field, value) {
    const data =
      field === "name"
        ? { [field]: value }
        : field === "defaultCheckIns"
        ? { [field]: value }
        : { [field]: Number(value) };
    await updateDoc(doc(db, "subscriptions", pkgId), data);
    loadPackages();
  }

  async function movePackage(pkgId, direction) {
    const index = packages.findIndex(p => p.id === pkgId);
    if (index === -1) return;

    let swapIndex;
    if (direction === "up" && index > 0) swapIndex = index - 1;
    if (direction === "down" && index < packages.length - 1) swapIndex = index + 1;
    if (swapIndex === undefined) return;

    const current = packages[index];
    const swapWith = packages[swapIndex];

    const currentOrder = current.order ?? index;
    const swapOrder = swapWith.order ?? swapIndex;

    await updateDoc(doc(db, "subscriptions", current.id), { order: swapOrder });
    await updateDoc(doc(db, "subscriptions", swapWith.id), { order: currentOrder });

    loadPackages();
  }

  // ---------------- Clients ----------------
  async function loadClients() {
    const uSnap = await getDocs(
      query(collection(db, "users"), where("role", "==", "client"), where("active", "==", true))
    );
    setUsers(uSnap.docs.map(d => ({ id: d.id, ...d.data() })));
  }

  async function loadCurrentSubs(uid) {
    const snap = await getDocs(
      query(collection(db, "clientSubscriptions"), where("userId", "==", uid), where("active", "==", true))
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
    subs.sort((a, b) => b.endDate - a.endDate);

// keep only the active one
setCurrentSubs(subs.length > 0 ? [subs[0]] : []);
  }

  async function assignSubscription() {
    if (!userId || !packageId) return alert("Sva polja su obavezna");

    const pkg = packages.find(p => p.id === packageId);
    const start = startDate ? new Date(startDate) : new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + (pkg.durationDays || 30));

    let weeklyCheckIns = checkInOption === "default" ? pkg.defaultCheckIns || "unlimited" : checkInOption;

    const weeks = Math.ceil((end - start) / (7 * 24 * 60 * 60 * 1000));
    const checkInsArray = [];
    for (let i = 0; i < weeks; i++) {
      checkInsArray.push(weeklyCheckIns === "unlimited" ? "unlimited" : 0);
    }

    const existing = await getDocs(
      query(collection(db, "clientSubscriptions"), where("userId", "==", userId), where("active", "==", true))
    );
    for (const d of existing.docs) {
      await updateDoc(doc(db, "clientSubscriptions", d.id), { active: false });
    }

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
    setUserId("");
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

  // ---------------- Render ----------------
  return (
    <div>
      <h2>Upravljanje paketima i dodela pretplate</h2>

      {/* --- Assign Subscription Form (top) --- */}
      <div style={{ border: "1px solid #ccc", padding: 10, marginBottom: 20 }}>
        <h3>Dodeli pretplatu klijentu</h3>

        <div style={{ marginBottom: 10 }}>
          <label>Izaberite klijenta: </label>
          <select value={userId} onChange={e => setUserId(e.target.value)}>
            <option value="">-- Odaberite klijenta --</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>
                {u.name} {u.surname} ({u.email})
              </option>
            ))}
          </select>
        </div>

        {Array.isArray(currentSubs) && currentSubs.length > 0 && (
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
          <label>Izaberite pretplatu: </label>
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
          <label>Izaberite broj dolazaka nedeljno: </label>
          <select value={checkInOption} onChange={e => setCheckInOption(e.target.value)}>
            {checkInOptions.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 10 }}>
          <label>Datum početka (opciono): </label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>

        <button onClick={assignSubscription}>Dodeli</button>
      </div>

      {/* --- Create New Package --- */}
      <div style={{ marginBottom: 10 }}>
        <input
          placeholder="Naziv paketa"
          value={newPackage.name}
          onChange={e => setNewPackage({ ...newPackage, name: e.target.value })}
          style={{ marginRight: 5 }}
        />
        <input
          type="number"
          placeholder="Trajanje (dani)"
          value={newPackage.durationDays}
          onChange={e => setNewPackage({ ...newPackage, durationDays: e.target.value })}
          style={{ marginRight: 5 }}
        />
        <input
          type="number"
          placeholder="Cena"
          value={newPackage.price}
          onChange={e => setNewPackage({ ...newPackage, price: e.target.value })}
          style={{ marginRight: 5 }}
        />
        <select
          value={newPackage.defaultCheckIns}
          onChange={e => setNewPackage({ ...newPackage, defaultCheckIns: e.target.value })}
          style={{ marginRight: 5 }}
        >
          {checkInOptions.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button onClick={createPackage}>Kreiraj paket</button>
      </div>

      {/* --- Packages Table --- */}
      <table border="1" cellPadding="5" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th>Naziv</th>
            <th>Trajanje (dani)</th>
            <th>Cena</th>
            <th>Podrazumevani dolasci nedeljno</th>
            <th>Status</th>
            <th>Akcija</th>
            <th>Redosled</th>
          </tr>
        </thead>
        <tbody>
          {packages.map((p, i) => (
            <tr key={p.id}>
              <td>
                <input value={p.name} onChange={e => updatePackage(p.id, "name", e.target.value)} />
              </td>
              <td>
                <input
                  type="number"
                  value={p.durationDays}
                  onChange={e => updatePackage(p.id, "durationDays", e.target.value)}
                  style={{ width: 60 }}
                />
              </td>
              <td>
                <input
                  type="number"
                  value={p.price}
                  onChange={e => updatePackage(p.id, "price", e.target.value)}
                  style={{ width: 80 }}
                />
              </td>
              <td>
                <select value={p.defaultCheckIns || "default"} onChange={e => updatePackage(p.id, "defaultCheckIns", e.target.value)}>
                  {checkInOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </td>
              <td>{p.active ? "Aktivan" : "Neaktivan"}</td>
              <td>
                <button onClick={() => toggleActive(p)}>{p.active ? "Deaktiviraj" : "Aktiviraj"}</button>
              </td>
              <td>
                <button onClick={() => movePackage(p.id, "up")} disabled={i === 0}>⬆</button>
                <button onClick={() => movePackage(p.id, "down")} disabled={i === packages.length - 1}>⬇</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
