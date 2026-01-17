import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "../firebase";
import { useNavigate, Link } from "react-router-dom";
import { ensureConversation } from "../chat/ensureConversation";

function getInitials(name = "") {
  const parts = name.trim().split(" ").filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function AdminChats() {
  const [conversations, setConversations] = useState([]);
  const [usersMap, setUsersMap] = useState({});
  const [search, setSearch] = useState("");

  const navigate = useNavigate();
  const COACH_ID = "A2g7h5o43mVc0bDGWM7al12bvPp1";

  /* ─────────────────────────────
     Load users once
  ───────────────────────────── */
  useEffect(() => {
    async function loadUsers() {
      const snap = await getDocs(collection(db, "users"));
      const map = {};

      snap.docs.forEach((d) => {
        const u = d.data();
        map[d.id] =
          `${u.name || ""} ${u.surname || ""}`.trim() || "Klijent";
      });

      setUsersMap(map);
    }

    loadUsers();
  }, []);

  /* ─────────────────────────────
     Listen to conversations
  ───────────────────────────── */
  useEffect(() => {
    const q = query(
      collection(db, "conversations"),
      orderBy("updatedAt", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      setConversations(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      );
    });

    return () => unsub();
  }, []);

  /* ─────────────────────────────
     Lookup: clientId → conversation
  ───────────────────────────── */
  const conversationByClientId = {};
  conversations.forEach((c) => {
    conversationByClientId[c.clientId] = c;
  });

  /* ─────────────────────────────
     Search mode: clients
  ───────────────────────────── */
  const searchActive = search.trim().length > 0;

  const searchedClients = Object.entries(usersMap)
    .filter(([_, name]) =>
      name.toLowerCase().includes(search.trim().toLowerCase())
    )
    .map(([id, name]) => ({
      id,
      name,
      conversation: conversationByClientId[id] || null,
    }));

  async function openConversation(clientId) {
    const convo = conversationByClientId[clientId];

    if (convo) {
      navigate(`/admin-chat/${convo.id}`);
      return;
    }

    await ensureConversation({
      clientId,
      coachId: COACH_ID,
    });

    navigate(`/admin-chat/${clientId}`);
  }

  return (
    <div className="px-4 py-6">
      <h2 className="mb-3 text-lg font-semibold text-white">
        Poruke
      </h2>

      {/* SEARCH */}
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

      {/* DEFAULT: CONVERSATIONS */}
      {!searchActive && (
        <>
          {conversations.length === 0 && (
            <p className="text-sm text-neutral-400">
              Nema poruka.
            </p>
          )}

          <div className="space-y-3">
            {conversations.map((c) => {
              const fullName =
                usersMap[c.clientId] || "Klijent";
              const unread = c.coachUnread > 0;

              return (
                <div
                  key={c.id}
                  onClick={() =>
                    navigate(`/admin-chat/${c.id}`)
                  }
                  className={`w-full rounded-xl p-4 transition cursor-pointer ${
                    unread
                      ? "bg-neutral-900"
                      : "bg-neutral-900/70"
                  } hover:bg-neutral-800`}
                >
                  <div className="flex items-center gap-3">
                    <Link
                      to={`/profil/${c.clientId}`}
                      onClick={(e) =>
                        e.stopPropagation()
                      }
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-700 text-sm font-medium text-white hover:ring-2 hover:ring-blue-500 transition"
                    >
                      {getInitials(fullName)}
                    </Link>

                    <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p
                          className={`truncate text-sm ${
                            unread
                              ? "font-medium text-white"
                              : "text-neutral-300"
                          }`}
                        >
                          {fullName}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-neutral-400">
                          {c.lastMessage || "—"}
                        </p>
                      </div>

                      {unread && (
                        <span className="shrink-0 rounded-full bg-blue-600 px-2 py-0.5 text-xs text-white">
                          {c.coachUnread}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* SEARCH MODE: CLIENT PICKER */}
      {searchActive && (
        <div className="space-y-3">
          {searchedClients.map((u) => {
            const convo = u.conversation;
            const unread = convo?.coachUnread > 0;

            return (
              <div
                key={u.id}
                onClick={() => openConversation(u.id)}
                className="w-full rounded-xl p-4 transition cursor-pointer bg-neutral-900/70 hover:bg-neutral-800"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-700 text-sm font-medium text-white">
                    {getInitials(u.name)}
                  </div>

                  <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-white">
                        {u.name}
                      </p>

                      {convo && (
                        <p className="mt-0.5 truncate text-xs text-neutral-400">
                          {convo.lastMessage || "—"}
                        </p>
                      )}
                    </div>

                    {unread && (
                      <span className="shrink-0 rounded-full bg-blue-600 px-2 py-0.5 text-xs text-white">
                        {convo.coachUnread}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {searchedClients.length === 0 && (
            <p className="text-sm text-neutral-400">
              Nema rezultata.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
