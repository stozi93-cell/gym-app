import { useEffect, useState } from "react";
import { collection, getDocs, addDoc, updateDoc, doc } from "firebase/firestore";
import { db } from "../firebase";

export default function AdminPackages() {
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

  useEffect(() => {
    load();
  }, []);

  // --- Load packages and sort by order ---
  async function load() {
    const snap = await getDocs(collection(db, "subscriptions"));
    let data = snap.docs.map((d, i) => ({ id: d.id, ...d.data() }));

    // Ensure each package has an order value
    data = data.map((p, i) => ({ ...p, order: p.order ?? i }));

    // Sort by order
    data.sort((a, b) => a.order - b.order);

    setPackages(data);
  }

  // --- Create new package ---
  async function createPackage() {
    const { name, durationDays, price, defaultCheckIns } = newPackage;
    if (!name || !durationDays || !price) {
      alert("Popunite sva polja");
      return;
    }

    // Set new package order as last
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
    load();
  }

  // --- Toggle active state ---
  async function toggleActive(pkg) {
    await updateDoc(doc(db, "subscriptions", pkg.id), {
      active: !pkg.active,
    });
    load();
  }

  // --- Update package field ---
  async function updatePackage(pkgId, field, value) {
    const data =
      field === "name"
        ? { [field]: value }
        : field === "defaultCheckIns"
        ? { [field]: value }
        : { [field]: Number(value) };

    await updateDoc(doc(db, "subscriptions", pkgId), data);
    load();
  }

  // --- Move package up/down ---
  async function movePackage(pkgId, direction) {
    const index = packages.findIndex(p => p.id === pkgId);
    if (index === -1) return;

    let swapIndex;
    if (direction === "up" && index > 0) swapIndex = index - 1;
    if (direction === "down" && index < packages.length - 1) swapIndex = index + 1;
    if (swapIndex === undefined) return;

    const current = packages[index];
    const swapWith = packages[swapIndex];

    // Swap order values in Firestore
    const currentOrder = current.order ?? index;
    const swapOrder = swapWith.order ?? swapIndex;

    await updateDoc(doc(db, "subscriptions", current.id), { order: swapOrder });
    await updateDoc(doc(db, "subscriptions", swapWith.id), { order: currentOrder });

    load(); // reload packages
  }

  return (
    <div>
      <h2>Upravljanje paketima</h2>

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
            <option key={opt.value} value={opt.value}>{opt.label}</option>
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
                <input
                  value={p.name}
                  onChange={e => updatePackage(p.id, "name", e.target.value)}
                />
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
                <select
                  value={p.defaultCheckIns || "default"}
                  onChange={e => updatePackage(p.id, "defaultCheckIns", e.target.value)}
                >
                  {checkInOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </td>
              <td>{p.active ? "Aktivan" : "Neaktivan"}</td>
              <td>
                <button onClick={() => toggleActive(p)}>
                  {p.active ? "Deaktiviraj" : "Aktiviraj"}
                </button>
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
