import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { Link, useNavigate } from "react-router-dom";
import Avatar from "../components/Avatar";
import { EmptyState, Panel, StatusPill } from "../components/ui/Primitives";
import { db } from "../firebase";

export default function AdminTrainingStudio() {
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const navigate = useNavigate();

  useEffect(() => {
    return onSnapshot(
      query(
        collection(db, "users"),
        where("role", "==", "client"),
        where("active", "==", true)
      ),
      (snap) => {
        setClients(
          snap.docs
            .map((d) => {
              const user = d.data();
              return {
                id: d.id,
                fullName:
                  `${user.name || ""} ${user.surname || ""}`.trim() ||
                  "Klijent",
                photoURL: user.photoURL || "",
              };
            })
            .sort((a, b) => a.fullName.localeCompare(b.fullName, "sr-Latn-RS"))
        );
        setLoading(false);
        setLoadError("");
      },
      (error) => {
        console.error("LOAD TRAINING CLIENTS ERROR", error);
        setLoading(false);
        setLoadError("Lista klijenata nije učitana. Pokušajte ponovo.");
      }
    );
  }, []);

  const filtered = clients.filter((client) =>
    client.fullName
      .toLocaleLowerCase("sr-Latn-RS")
      .includes(search.toLocaleLowerCase("sr-Latn-RS"))
  );

  return (
    <div className="space-y-4">
      <Panel className="space-y-3 p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
            Planovi treninga
          </p>
          <StatusPill tone="neutral">{clients.length}</StatusPill>
        </div>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Pretraži klijente..."
          className="w-full rounded-xl border border-white/10 bg-neutral-950/60 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-brand-blue-500"
        />
      </Panel>

      <div className="space-y-3">
        {loading && <EmptyState title="Učitavanje..." />}

        {loadError && (
          <EmptyState title="Lista nije učitana" description={loadError} />
        )}

        {filtered.map((client) => (
          <Panel
            key={client.id}
            onClick={() => navigate(`/treninzi/${client.id}`)}
            className="w-full cursor-pointer p-4 transition hover:bg-white/5"
          >
            <div className="flex items-center gap-3">
              <Link
                to={`/profil/${client.id}`}
                onClick={(event) => event.stopPropagation()}
                className="shrink-0 rounded-full hover:ring-2 hover:ring-brand-blue-500"
              >
                <Avatar name={client.fullName} photoURL={client.photoURL} />
              </Link>

              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">
                  {client.fullName}
                </p>
                <p className="text-xs text-neutral-400">
                  Otvori plan treninga
                </p>
              </div>
            </div>
          </Panel>
        ))}

        {!loading && !loadError && filtered.length === 0 && (
          <EmptyState
            title="Nema rezultata"
            description="Promeni pretragu da pronađeš klijenta."
          />
        )}
      </div>
    </div>
  );
}
