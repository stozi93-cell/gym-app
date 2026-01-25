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
      query(
        collection(db, "clientSubscriptions"),
        where("active", "==", true)
      )
    );

    const activeSubs = {};
    const today = new Date();

    for (const d of subSnap.docs) {
      const cs = d.data();
      const endDate = cs.endDate?.toDate
        ? cs.endDate.toDate()
        : new Date(cs.endDate);

      if (endDate >= today) {
        activeSubs[cs.userId] = {
          endDate,
          subId: d.id,
        };
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
    applyFilter(clients)
  ).filter((c) =>
    `${c.name} ${c.surname} ${c.email}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const formatDate = (d) =>
    d instanceof Date
      ? d.toLocaleDateString("sr-Latn-RS", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })
      : "—";

  const prolongSubscription = async (subId) => {
    const subRef = doc(db, "clientSubscriptions", subId);
    const subSnap = await getDoc(subRef);
    const subData = subSnap.data();

    const currentEnd = subData.endDate?.toDate
      ? subData.endDate.toDate()
      : new Date(subData.endDate);

    const newEnd = new Date(currentEnd);
    newEnd.setDate(newEnd.getDate() + 7);

    await updateDoc(subRef, { endDate: newEnd });
    alert("Pretplata produžena 7 dana");
    load();
  };

  return (
    <div className="px-2 py-1 space-y-6">

      {/* TOOLS */}
      <div className="mx-2 rounded-xl bg-neutral-900 p-4 space-y-3">
        <input
          type="text"
          placeholder="Pretraga…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-400"
        />

        <div className="flex gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="flex-1 rounded bg-neutral-800 px-2 py-1 text-sm"
          >
            <option value="all">Svi</option>
            <option value="active">Aktivni</option>
            <option value="inactive">Bez pretplate</option>
          </select>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="flex-1 rounded bg-neutral-800 px-2 py-1 text-sm"
          >
            <option value="name-asc">Ime A–Z</option>
            <option value="name-desc">Ime Z–A</option>
            <option value="sub">Aktivne prve</option>
          </select>
        </div>
      </div>

      {/* CLIENT LIST */}
      <div className="space-y-3">
        {visibleClients.map((c) => (
          <div
            key={c.id}
            className="mx-2 rounded-xl bg-neutral-900 p-4 space-y-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  to={`/profil/${c.id}`}
                  className="block truncate font-medium text-blue-400"
                >
                  {c.name} {c.surname}
                </Link>
                <p className="truncate text-xs text-neutral-400">
                  {c.email}
                </p>
              </div>

              {c.hasActiveSub ? (
                <span className="text-xs font-medium text-green-500">
                  Aktivna
                </span>
              ) : (
                <span className="text-xs font-medium text-red-400">
                  Nema
                </span>
              )}
            </div>

            {c.hasActiveSub && (
              <p className="text-xs text-neutral-400">
                Važi do {formatDate(c.subEnd)}
              </p>
            )}

            <div className="flex gap-3 pt-2">
              {c.hasActiveSub && (
                <button
                  onClick={() =>
                    prolongSubscription(c.activeSubId)
                  }
                  className="text-sm text-green-400"
                >
                  Produži
                </button>
              )}

              <button
                onClick={() =>
                  navigate(`/paketi?clientId=${c.id}`)
                }
                className="text-sm text-blue-400"
              >
                Dodeli paket
              </button>
            </div>
          </div>
        ))}

        {!visibleClients.length && (
          <p className="px-4 text-sm text-neutral-400">
            Nema rezultata.
          </p>
        )}
      </div>
    </div>
  );
}
