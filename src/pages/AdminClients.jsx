import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { Link } from "react-router-dom";

export default function AdminClients() {
  const [clients, setClients] = useState([]);
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("name-asc");
  const [search, setSearch] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const userSnap = await getDocs(collection(db, "users"));
    const subSnap = await getDocs(
      query(
        collection(db, "clientSubscriptions"),
        where("active", "==", true)
      )
    );

    const activeSubs = {};
    const today = new Date();

    for (const d of subSnap.docs) {
      const cs = d.data();
      const endDate = cs.endDate.toDate
        ? cs.endDate.toDate()
        : new Date(cs.endDate);

      if (endDate >= today) {
        activeSubs[cs.userId] = endDate;
      }
    }

    const data = userSnap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      hasActiveSub: !!activeSubs[d.id],
      subEnd: activeSubs[d.id] || null,
    }));

    setClients(data);
  }

  function applySearch(list) {
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(c =>
      `${c.name} ${c.surname} ${c.email}`
        .toLowerCase()
        .includes(q)
    );
  }

  function applyFilter(list) {
    if (filter === "active") {
      return list.filter(c => c.hasActiveSub);
    }
    if (filter === "inactive") {
      return list.filter(c => !c.hasActiveSub);
    }
    return list;
  }

  function applySort(list) {
    const sorted = [...list];

    if (sort === "name-asc") {
      sorted.sort((a, b) =>
        `${a.name} ${a.surname}`.localeCompare(
          `${b.name} ${b.surname}`
        )
      );
    }

    if (sort === "name-desc") {
      sorted.sort((a, b) =>
        `${b.name} ${b.surname}`.localeCompare(
          `${a.name} ${a.surname}`
        )
      );
    }

    if (sort === "sub") {
      sorted.sort(
        (a, b) =>
          (b.hasActiveSub === true) -
          (a.hasActiveSub === true)
      );
    }

    return sorted;
  }

  const visibleClients = applySort(
    applyFilter(
      applySearch(clients)
    )
  );

  return (
    <div>
      <h2>Lista klijenata</h2>

      {/* Controls */}
      <div style={{ marginBottom: 15 }}>
        <input
          type="text"
          placeholder="Pretraga (ime, email...)"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ marginRight: 10 }}
        />

        <select
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{ marginRight: 10 }}
        >
          <option value="all">Svi klijenti</option>
          <option value="active">Samo aktivni</option>
          <option value="inactive">Bez pretplate</option>
        </select>

        <select
          value={sort}
          onChange={e => setSort(e.target.value)}
        >
          <option value="name-asc">Ime A–Z</option>
          <option value="name-desc">Ime Z–A</option>
          <option value="sub">Aktivne pretplate prve</option>
        </select>
      </div>

      {/* Table */}
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
          {visibleClients.map(c => (
            <tr key={c.id}>
              <td>
                {c.name} {c.surname}
              </td>
              <td>{c.email}</td>
              <td>
                {c.hasActiveSub ? (
                  <span style={{ color: "green" }}>
                    Aktivna (do{" "}
                    {c.subEnd.toLocaleDateString("sr-RS")})
                  </span>
                ) : (
                  <span style={{ color: "red" }}>Nema</span>
                )}
              </td>
              <td>
                <Link to={`/profil/${c.id}`}>
                  <button>Profil</button>
                </Link>

                <Link to={`/dodela-pretplate?uid=${c.id}`}>
                  <button style={{ marginLeft: 5 }}>
                    + Pretplata
                  </button>
                </Link>

                {c.hasActiveSub && (
                  <Link to={`/dodela-pretplate?uid=${c.id}&mode=renew`}>
                    <button style={{ marginLeft: 5 }}>
                      Produži
                    </button>
                  </Link>
                )}
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
