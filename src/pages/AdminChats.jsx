import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { Link, useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { ensureConversation } from "../chat/ensureConversation";
import { useAuth } from "../context/AuthContext";

function getInitials(name = "") {
  const parts = name.trim().split(" ").filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function AdminChats() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [usersMap, setUsersMap] = useState({});
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    async function loadClients() {
      const snap = await getDocs(collection(db, "users"));
      const map = {};

      snap.docs.forEach((d) => {
        const profile = d.data();
        if (profile.role !== "client") return;
        map[d.id] =
          `${profile.name || ""} ${profile.surname || ""}`.trim() ||
          "Klijent";
      });

      setUsersMap(map);
    }

    loadClients();
  }, []);

  useEffect(() => {
    if (!user?.uid) return;

    const conversationsQuery = query(
      collection(db, "conversations"),
      where("coachId", "==", user.uid)
    );

    return onSnapshot(conversationsQuery, (snap) => {
      setConversations(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            return (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0);
          })
      );
    });
  }, [user?.uid]);

  const conversationByClientId = useMemo(() => {
    return Object.fromEntries(
      conversations.map((conversation) => [
        conversation.clientId,
        conversation,
      ])
    );
  }, [conversations]);

  const searchActive = search.trim().length > 0;
  const searchedClients = Object.entries(usersMap)
    .filter(([, name]) =>
      name.toLowerCase().includes(search.trim().toLowerCase())
    )
    .map(([id, name]) => ({
      id,
      name,
      conversation: conversationByClientId[id] || null,
    }));

  async function openConversation(clientId) {
    if (!user?.uid) return;

    const existing = conversationByClientId[clientId];
    if (existing) {
      navigate(`/admin-chat/${existing.id}`);
      return;
    }

    const conversationId = await ensureConversation({
      clientId,
      coachId: user.uid,
    });

    if (conversationId) navigate(`/admin-chat/${conversationId}`);
  }

  function ConversationCard({ conversation, clientId, name }) {
    const unread = conversation?.coachUnread > 0;

    return (
      <div
        onClick={() => openConversation(clientId)}
        className={`w-full cursor-pointer rounded-xl p-4 transition hover:bg-neutral-800 ${
          unread ? "bg-neutral-900" : "bg-neutral-900/70"
        }`}
      >
        <div className="flex items-center gap-3">
          <Link
            to={`/profil/${clientId}`}
            onClick={(event) => event.stopPropagation()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-700 text-sm font-medium text-white transition hover:ring-2 hover:ring-blue-500"
          >
            {getInitials(name)}
          </Link>

          <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
            <div className="min-w-0">
              <p
                className={`truncate text-sm ${
                  unread ? "font-medium text-white" : "text-neutral-300"
                }`}
              >
                {name}
              </p>
              {conversation && (
                <p className="mt-0.5 truncate text-xs text-neutral-400">
                  {conversation.lastMessage || "-"}
                </p>
              )}
            </div>

            {unread && (
              <span className="shrink-0 rounded-full bg-blue-600 px-2 py-0.5 text-xs text-white">
                {conversation.coachUnread}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-1">
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Pretraži klijente..."
        className="mb-4 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-blue-500"
      />

      {!searchActive && (
        <div className="space-y-3">
          {conversations.length === 0 && (
            <p className="text-sm text-neutral-400">Nema poruka.</p>
          )}
          {conversations.map((conversation) => (
            <ConversationCard
              key={conversation.id}
              conversation={conversation}
              clientId={conversation.clientId}
              name={usersMap[conversation.clientId] || "Klijent"}
            />
          ))}
        </div>
      )}

      {searchActive && (
        <div className="space-y-3">
          {searchedClients.map((client) => (
            <ConversationCard
              key={client.id}
              conversation={client.conversation}
              clientId={client.id}
              name={client.name}
            />
          ))}
          {searchedClients.length === 0 && (
            <p className="text-sm text-neutral-400">Nema rezultata.</p>
          )}
        </div>
      )}
    </div>
  );
}
