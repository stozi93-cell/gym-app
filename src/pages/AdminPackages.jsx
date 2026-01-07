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

  async function load() {
    const snap = await getDocs(collection(db, "subscriptions"));
    setPackages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }

  async function createPackage() {
    const { name, durationDays, price, defaultCheckIns } = newPackage;
    if (!name || !durationDays || !price) {
      alert("Popunite sva polja");
      return;
    }

    await addDoc(collection(db, "subscriptions"), {
      name,
      durationDays: Number(durationDays),
      price: Number(price),
      defaultCheckIns,
      active: true,
    });

    setNewPackage({ name: "", durationDays: "", price: "", defaultCheckIns: "default" });
    load();
  }

  async function toggleActive(pkg) {
    await updateDoc(doc(db, "subscriptions", pkg.id), {
      active: !pkg.active,
    });
    load();
  }

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

  return (
    <div>
      <h2>Upravljanje paketima</h2>

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

      <table border="1" cellPadding="5" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th>Naziv</th>
            <th>Trajanje (dani)</th>
            <th>Cena</th>
            <th>Podrazumevani dolasci nedeljno</th>
            <th>Status</th>
            <th>Akcija</th>
          </tr>
        </thead>
        <tbody>
          {packages.map(p => (
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
