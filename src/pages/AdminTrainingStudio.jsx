import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { useNavigate, Link } from "react-router-dom";

function getInitials(name = "") {
  const parts = name.trim().split(" ").filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

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
          snap.docs.map((d) => {
          const u = d.data();
          return {
            id: d.id,
            fullName:
              `${u.name || ""} ${u.surname || ""}`.trim() || "Klijent",
          };
          }).sort((a, b) => a.fullName.localeCompare(b.fullName, "sr-Latn-RS"))
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

  const filtered = clients.filter((c) =>
    c.fullName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="px-4 py-1">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Pretraži klijente…"
        className="
          mb-4 w-full rounded-lg
          bg-neutral-900 px-3 py-2
          text-sm text-white
          outline-none
          placeholder:text-neutral-500
          border border-neutral-800
          focus:border-blue-500
        "
      />

      <div className="space-y-3">
        {loading && (
          <p className="text-sm text-neutral-400">
            Učitavanje...
          </p>
        )}

        {loadError && (
          <p className="text-sm text-red-400">
            {loadError}
          </p>
        )}

        {filtered.map((c) => (
          <div
            key={c.id}
            onClick={() => navigate(`/treninzi/${c.id}`)}
            className="
              w-full rounded-xl p-4
              bg-neutral-900/70
              hover:bg-neutral-800
              transition cursor-pointer
            "
          >
            <div className="flex items-center gap-3">
              <Link
                to={`/profil/${c.id}`}
                onClick={(e) => e.stopPropagation()}
                className="
                  flex h-10 w-10 items-center justify-center
                  rounded-full bg-neutral-700
                  text-sm font-medium text-white
                  hover:ring-2 hover:ring-blue-500
                "
              >
                {getInitials(c.fullName)}
              </Link>

              <div>
                <p className="text-sm text-white">
                  {c.fullName}
                </p>
                <p className="text-xs text-neutral-400">
                  Otvori plan treninga
                </p>
              </div>
            </div>
          </div>
        ))}

        {!loading && !loadError && filtered.length === 0 && (
          <p className="text-sm text-neutral-400">
            Nema rezultata.
          </p>
        )}
      </div>
    </div>
  );
}
