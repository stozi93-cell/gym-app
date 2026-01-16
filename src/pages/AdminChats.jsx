import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "../firebase";
import { useNavigate } from "react-router-dom";

export default function AdminChats() {
  const [conversations, setConversations] = useState([]);
  const [usersMap, setUsersMap] = useState({});
  const navigate = useNavigate();

  /* ─────────────────────────────
     Load users once
  ───────────────────────────── */
  useEffect(() => {
    async function loadUsers() {
      const snap = await getDocs(collection(db, "users"));
      const map = {};

      snap.docs.forEach((d) => {
        const u = d.data();
        const name =
          `${u.name || ""} ${u.surname || ""}`.trim() || d.id;
        map[d.id] = name;
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

  return (
    <div className="px-4 py-6">
      <h2 className="mb-4 text-lg font-semibold text-white">
        Poruke
      </h2>

      {conversations.length === 0 && (
        <p className="text-sm text-neutral-400">
          Nema poruka.
        </p>
      )}

      <div className="space-y-3">
        {conversations.map((c) => (
          <button
            key={c.id}
            onClick={() => navigate(`/admin-chat/${c.id}`)}
            className="w-full rounded-xl bg-neutral-900 p-4 text-left hover:bg-neutral-800 transition"
          >
            <div className="flex justify-between items-start gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {usersMap[c.clientId] || c.clientId}
                </p>
                <p className="text-xs text-neutral-400 truncate mt-0.5">
                  {c.lastMessage || "—"}
                </p>
              </div>

              {c.coachUnread > 0 && (
                <span className="shrink-0 rounded-full bg-blue-600 px-2 py-0.5 text-xs text-white">
                  {c.coachUnread}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
