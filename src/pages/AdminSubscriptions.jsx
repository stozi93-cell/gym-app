import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { Link } from "react-router-dom";

export default function AdminSubscriptions() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const csSnap = await getDocs(collection(db, "clientSubscriptions"));
    const userSnap = await getDocs(collection(db, "users"));
    const pkgSnap = await getDocs(collection(db, "subscriptions"));

    const users = {};
    userSnap.docs.forEach(d => (users[d.id] = d.data()));

    const pkgs = {};
    pkgSnap.docs.forEach(d => {
      const data = d.data();
      if (data.order === undefined) data.order = 999; // default to end if no order
      pkgs[d.id] = { id: d.id, ...data };
    });

    const today = new Date();

    const data = csSnap.docs.map(d => {
      const cs = d.data();

      const startDate = cs.startDate?.toDate ? cs.startDate.toDate() : new Date(cs.startDate);
      const endDate = cs.endDate?.toDate ? cs.endDate.toDate() : new Date(cs.endDate);

      let status = "expired";
      if (cs.active === false) status = "deactivated";
      else if (endDate >= today) status = "active";

      return {
        id: d.id,
        userId: cs.userId,
        subscriptionId: cs.subscriptionId,
        startDate,
        endDate,
        status,
        user: users[cs.userId],
        pkg: pkgs[cs.subscriptionId],
      };
    });

    // sort by package order first, then startDate
    data.sort((a, b) => (a.pkg.order || 999) - (b.pkg.order || 999));

    setRows(data);
  }

  async function deactivate(id) {
    const ok = window.confirm("Deaktivirati ovu pretplatu?");
    if (!ok) return;

    await updateDoc(doc(db, "clientSubscriptions", id), { active: false });
    load();
  }

  // --- Move package order up/down ---
  const movePackage = async (pkgId, direction) => {
    const allPkgsSnap = await getDocs(collection(db, "subscriptions"));
    const pkgs = allPkgsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    pkgs.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

    const index = pkgs.findIndex(p => p.id === pkgId);
    if (index < 0) return;

    let swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= pkgs.length) return;

    const pkgA = pkgs[index];
    const pkgB = pkgs[swapIndex];

    const tempOrder = pkgA.order ?? 999;
    await updateDoc(doc(db, "subscriptions", pkgA.id), { order: pkgB.order ?? 999 });
    await updateDoc(doc(db, "subscriptions", pkgB.id), { order: tempOrder });

    load();
  };

  function statusLabel(status) {
    if (status === "active") return <span style={{ color: "green" }}>Aktivna</span>;
    if (status === "expired") return <span style={{ color: "red" }}>Istekla</span>;
    return <span style={{ color: "gray" }}>Deaktivirana</span>;
  }

  return (
    <div>
      <h2>Pregled pretplata</h2>

      <table border="1" cellPadding="6" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th>Klijent</th>
            <th>
              Paket
              <br />
              <small>(Up/Down da promenite redosled)</small>
            </th>
            <th>Period</th>
            <th>Status</th>
            <th>Akcija</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td>
                <Link to={`/profil/${r.userId}`}>
                  {r.user?.name} {r.user?.surname}
                </Link>
              </td>
              <td>
                {r.pkg?.name}{" "}
                <button onClick={() => movePackage(r.pkg.id, "up")}>↑</button>
                <button onClick={() => movePackage(r.pkg.id, "down")}>↓</button>
              </td>
              <td>
                {r.startDate.toLocaleDateString("sr-RS")} –{" "}
                {r.endDate.toLocaleDateString("sr-RS")}
              </td>
              <td>{statusLabel(r.status)}</td>
              <td>
                {r.status === "active" && (
                  <button onClick={() => deactivate(r.id)}>Deaktiviraj</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {!rows.length && <p>Nema pretplata.</p>}
    </div>
  );
}
