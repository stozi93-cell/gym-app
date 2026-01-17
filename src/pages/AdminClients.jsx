import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useNavigate, Link } from "react-router-dom";

export default function AdminClients() {
  const [clients, setClients] = useState([]);
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("name-asc");
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const userSnap = await getDocs(collection(db, "users"));
    const subSnap = await getDocs(
      query(collection(db, "clientSubscriptions"), where("active", "==", true))
    );

    const activeSubs = {};
    const today = new Date();

    for (const d of subSnap.docs) {
      const cs = d.data();
      const endDate = cs.endDate?.toDate
        ? cs.endDate.toDate()
        : new Date(cs.endDate);

      if (endDate >= today) {
        activeSubs[cs.userId] = { endDate, subId: d.id };
      }
    }

    const data = userSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      hasActiveSub: !!activeSubs[d.id],
      subEnd: activeSubs[d.id]?.endDate || null,
      activeSubId: activeSubs[d.id]?.subId || null,
    }));

    setClients(data);
  }

  function applyFilter(list) {
    if (filter === "active") return list.filter((c) => c.hasActiveSub);
    if (filter === "inactive") return list.filter((c) => !c.hasActiveSub);
    return list;
  }

  function applySort(list) {
    const sorted = [...list];
    if (sort === "name-asc") {
      sorted.sort((a, b) =>
        `${a.name} ${a.surname}`.localeCompare(`${b.name} ${b.surname}`)
      );
    }
    if (sort === "name-desc") {
      sorted.sort((a, b) =>
        `${b.name} ${b.surname}`.localeCompare(`${a.name} ${a.surname}`)
      );
    }
    if (sort === "sub") {
      sorted.sort(
        (a, b) => (b.hasActiveSub === true) - (a.hasActiveSub === true)
      );
    }
    return sorted;
  }

  const visibleClients = applySort(applyFilter(clients)).filter((c) =>
    `${c.name} ${c.surname} ${c.email}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const formatDate = (d) =>
    d?.toDate
      ? d.toDate().toLocaleDateString("sr-Latn-RS", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })
      : d instanceof Date
      ? d.toLocaleDateString("sr-Latn-RS", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })
      : "—";

  // ✅ EXTEND BY 7 DAYS (FIXED)
  const prolongSubscription = async (subId) => {
    const subRef = doc(db, "clientSubscriptions", subId);
    const subSnap = await getDoc(subRef);
    const subData = subSnap.data();

    const currentEnd = subData.endDate?.toDate
      ? subData.endDate.toDate()
      : new Date(subData.endDate);

    const newEnd = new Date(currentEnd);
    newEnd.setDate(newEnd.getDate() + 7); // ⬅️ 7 days

    await updateDoc(subRef, { endDate: newEnd });
    alert("Pretplata produžena 7 dana");
    load();
  };

  return (
    <div>
      <h2>Lista klijenata</h2>

      <div style={{ marginBottom: 15 }}>
        <input
          type="text"
          placeholder="Pretraga..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ marginRight: 10 }}
        />

        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ marginRight: 10 }}
        >
          <option value="all">Svi klijenti</option>
          <option value="active">Samo aktivni</option>
          <option value="inactive">Bez pretplate</option>
        </select>

        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="name-asc">Ime A–Z</option>
          <option value="name-desc">Ime Z–A</option>
          <option value="sub">Aktivne pretplate prve</option>
        </select>
      </div>

      <table border="1" cellPadding="6" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th>Ime</th>
            <th>Email</th>
            <th>Pretplata</th>
            <th>Akcije</th>
          </tr>
        </thead>
        <tbody>
          {visibleClients.map((c) => (
            <tr key={c.id}>
              <td>
                <Link
  to={`/profil/${c.id}`}
  style={{
    fontWeight: "bold",
    textDecoration: "none",
    color: "#007bff",
  }}
>
  {c.name} {c.surname}
</Link>

              </td>
              <td>{c.email}</td>
              <td>
                {c.hasActiveSub ? (
                  <span style={{ color: "green" }}>
                    Aktivna (do {formatDate(c.subEnd)})
                  </span>
                ) : (
                  <span style={{ color: "red" }}>Nema</span>
                )}
              </td>
              <td>
                {c.hasActiveSub && (
                  <button
                    style={{ marginLeft: 5 }}
                    onClick={() => prolongSubscription(c.activeSubId)}
                  >
                    Produži
                  </button>
                )}

                <button
  style={{ marginLeft: 5 }}
  onClick={() => navigate(`/paketi?clientId=${c.id}`)}
>
  + Pretplata
</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {!visibleClients.length && (
        <p style={{ marginTop: 10 }}>Nema rezultata.</p>
      )}
    </div>
  );
}
