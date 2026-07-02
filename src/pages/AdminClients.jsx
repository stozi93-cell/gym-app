import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { Link, useNavigate } from "react-router-dom";
import Avatar from "../components/Avatar";
import { EmptyState, Panel, StatusPill } from "../components/ui/Primitives";
import { db } from "../firebase";

const EXPIRY_WARNING_DAYS = 7;

const FILTER_OPTIONS = [
  { value: "all", label: "Svi" },
  { value: "active", label: "Aktivni" },
  { value: "expiring", label: "Pred istekom" },
  { value: "inactive", label: "Bez pretplate" },
];

function startOfDay(date) {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function getDaysRemaining(endDate) {
  if (!(endDate instanceof Date)) return null;
  return Math.ceil((startOfDay(endDate) - startOfDay(new Date())) / 86400000);
}

export default function AdminClients() {
  const [clients, setClients] = useState([]);
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("name-asc");
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

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

    setClients(
      userSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        hasActiveSub: !!activeSubs[d.id],
        subEnd: activeSubs[d.id]?.endDate || null,
        activeSubId: activeSubs[d.id]?.subId || null,
        daysRemaining: getDaysRemaining(activeSubs[d.id]?.endDate),
      }))
    );
  }

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function applyFilter(list) {
    if (filter === "active") return list.filter((client) => client.hasActiveSub);
    if (filter === "inactive") return list.filter((client) => !client.hasActiveSub);
    if (filter === "expiring") {
      return list.filter(
        (client) =>
          client.hasActiveSub &&
          client.daysRemaining >= 0 &&
          client.daysRemaining <= EXPIRY_WARNING_DAYS
      );
    }
    return list;
  }

  function applySort(list) {
    const sorted = [...list];

    if (sort === "name-asc") {
      sorted.sort((a, b) =>
        `${a.name || ""} ${a.surname || ""}`.localeCompare(
          `${b.name || ""} ${b.surname || ""}`,
          "sr-Latn-RS"
        )
      );
    }

    if (sort === "name-desc") {
      sorted.sort((a, b) =>
        `${b.name || ""} ${b.surname || ""}`.localeCompare(
          `${a.name || ""} ${a.surname || ""}`,
          "sr-Latn-RS"
        )
      );
    }

    if (sort === "sub") {
      sorted.sort((a, b) => (b.hasActiveSub === true) - (a.hasActiveSub === true));
    }

    return sorted;
  }

  const visibleClients = applySort(applyFilter(clients)).filter((client) =>
    `${client.name || ""} ${client.surname || ""} ${client.email || ""}`
      .toLocaleLowerCase("sr-Latn-RS")
      .includes(search.toLocaleLowerCase("sr-Latn-RS"))
  );

  const activeCount = clients.filter((client) => client.hasActiveSub).length;
  const expiringCount = clients.filter(
    (client) =>
      client.hasActiveSub &&
      client.daysRemaining >= 0 &&
      client.daysRemaining <= EXPIRY_WARNING_DAYS
  ).length;

  const formatDate = (date) =>
    date instanceof Date
      ? date.toLocaleDateString("sr-Latn-RS", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })
      : "-";

  return (
    <div className="space-y-4">
      <Panel className="space-y-3 p-3">
        <div className="grid grid-cols-3 gap-2">
          <ClientMetric label="Ukupno" value={clients.length} />
          <ClientMetric label="Aktivni" value={activeCount} />
          <ClientMetric label="Ističe" value={expiringCount} />
        </div>

        <input
          type="text"
          placeholder="Pretraga..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="w-full rounded-xl border border-white/10 bg-neutral-950/60 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500 transition focus:border-brand-blue-500 focus:bg-neutral-950"
        />

        <div className="grid grid-cols-2 gap-2">
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${
                filter === option.value
                  ? "border-brand-blue-500 bg-brand-blue-500 text-white shadow-glow"
                  : "border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <label className="block text-xs font-medium text-neutral-400">
          Sortiranje
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            className="mt-1 w-full rounded-xl border border-white/10 bg-neutral-950/60 px-3 py-2.5 text-sm text-white outline-none focus:border-brand-blue-500"
          >
            <option value="name-asc">Ime A-Z</option>
            <option value="name-desc">Ime Z-A</option>
            <option value="sub">Aktivne prve</option>
          </select>
        </label>
      </Panel>

      <div className="space-y-3">
        {visibleClients.map((client) => (
          <Panel key={client.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 gap-3">
                <Avatar
                  name={`${client.name || ""} ${client.surname || ""}`.trim()}
                  photoURL={client.photoURL || ""}
                  className="h-11 w-11 text-sm"
                />
                <div className="min-w-0">
                  <Link
                    to={`/profil/${client.id}`}
                    className="block truncate font-semibold text-white"
                  >
                    {client.name} {client.surname}
                  </Link>
                  <p className="truncate text-xs text-neutral-400">
                    {client.email}
                  </p>
                </div>
              </div>

              {client.hasActiveSub ? (
                <StatusPill tone={client.daysRemaining <= EXPIRY_WARNING_DAYS ? "amber" : "green"}>
                  Aktivna
                </StatusPill>
              ) : (
                <StatusPill tone="red">Nema</StatusPill>
              )}
            </div>

            {client.hasActiveSub && (
              <p
                className={`mt-3 rounded-xl border px-3 py-2 text-xs ${
                  client.daysRemaining <= EXPIRY_WARNING_DAYS
                    ? "border-amber-400/20 bg-amber-400/10 font-medium text-amber-200"
                    : "border-white/10 bg-white/5 text-neutral-300"
                }`}
              >
                Važi do {formatDate(client.subEnd)}
                {client.daysRemaining <= EXPIRY_WARNING_DAYS &&
                  ` (${client.daysRemaining} dana)`}
              </p>
            )}

            <div className="mt-3 flex gap-2">
              {client.hasActiveSub && (
                <button
                  onClick={() => navigate(`/profil/${client.id}?editSubscription=1`)}
                  className="rounded-xl border border-brand-green-500/25 bg-brand-green-500/10 px-3 py-2 text-xs font-medium text-brand-green-300 transition hover:bg-brand-green-500/15"
                >
                  Izmeni
                </button>
              )}

              <button
                onClick={() => navigate(`/paketi?clientId=${client.id}`)}
                className="rounded-xl border border-brand-blue-500/25 bg-brand-blue-500/10 px-3 py-2 text-xs font-medium text-brand-blue-300 transition hover:bg-brand-blue-500/15"
              >
                Dodeli paket
              </button>
            </div>
          </Panel>
        ))}

        {!visibleClients.length && (
          <EmptyState
            title="Nema rezultata"
            description="Promeni pretragu ili izabrani filter."
          />
        )}
      </div>
    </div>
  );
}

function ClientMetric({ label, value }) {
  return (
    <div className="rounded-xl border border-white/10 bg-neutral-950/60 px-3 py-2 text-center">
      <p className="text-base font-semibold text-white">{value}</p>
      <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-neutral-500">
        {label}
      </p>
    </div>
  );
}
