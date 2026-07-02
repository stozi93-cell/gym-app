import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { Link, useNavigate } from "react-router-dom";
import { ensureConversation } from "../chat/ensureConversation";
import Avatar from "../components/Avatar";
import { EmptyState, Panel } from "../components/ui/Primitives";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase";

export default function AdminChats() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [usersMap, setUsersMap] = useState({});
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    return onSnapshot(collection(db, "users"), (snap) => {
      const map = {};

      snap.docs.forEach((d) => {
        const profile = d.data();
        if (profile.role !== "client") return;
        map[d.id] = {
          name:
            `${profile.name || ""} ${profile.surname || ""}`.trim() ||
            "Klijent",
          photoURL: profile.photoURL || "",
        };
      });

      setUsersMap(map);
    });
  }, []);

  useEffect(() => {
    if (!user?.uid) return undefined;

    const conversationsQuery = query(
      collection(db, "conversations"),
      where("coachId", "==", user.uid)
    );

    return onSnapshot(conversationsQuery, (snap) => {
      setConversations(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort(
            (a, b) =>
              (b.updatedAt?.toMillis?.() || 0) -
              (a.updatedAt?.toMillis?.() || 0)
          )
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
    .filter(([, client]) =>
      client.name
        .toLocaleLowerCase("sr-Latn-RS")
        .includes(search.trim().toLocaleLowerCase("sr-Latn-RS"))
    )
    .map(([id, client]) => ({
      id,
      ...client,
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

  function ConversationCard({ conversation, clientId, name, photoURL }) {
    const unread = conversation?.coachUnread > 0;

    return (
      <Panel
        onClick={() => openConversation(clientId)}
        className={`w-full cursor-pointer p-4 transition hover:bg-white/5 ${
          unread ? "border-brand-blue-500/35 bg-neutral-900" : "bg-neutral-900/70"
        }`}
      >
        <div className="flex items-center gap-3">
          <Link
            to={`/profil/${clientId}`}
            onClick={(event) => event.stopPropagation()}
            className="shrink-0 rounded-full transition hover:ring-2 hover:ring-brand-blue-500"
          >
            <Avatar name={name} photoURL={photoURL} />
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
              <span className="shrink-0 rounded-full bg-brand-blue-500 px-2 py-0.5 text-xs text-white">
                {conversation.coachUnread}
              </span>
            )}
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <Panel className="p-3">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Pretraži klijente..."
          className="w-full rounded-xl border border-white/10 bg-neutral-950/60 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-brand-blue-500"
        />
      </Panel>

      {!searchActive && (
        <div className="space-y-3">
          {conversations.length === 0 && (
            <EmptyState
              title="Nema poruka"
              description="Kada razgovor počne, pojaviće se ovde."
            />
          )}
          {conversations.map((conversation) => (
            <ConversationCard
              key={conversation.id}
              conversation={conversation}
              clientId={conversation.clientId}
              name={usersMap[conversation.clientId]?.name || "Klijent"}
              photoURL={usersMap[conversation.clientId]?.photoURL || ""}
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
              photoURL={client.photoURL}
            />
          ))}
          {searchedClients.length === 0 && (
            <EmptyState
              title="Nema rezultata"
              description="Pokušaj sa drugim imenom ili prezimenom."
            />
          )}
        </div>
      )}
    </div>
  );
}
