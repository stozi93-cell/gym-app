import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { useSearchParams } from "react-router-dom";
import { db } from "../firebase";
import { ensureConversation } from "../chat/ensureConversation";
import { useAuth } from "../context/AuthContext";

function SendIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M6 12L3 21l18-9L3 3l3 9z" />
      <path d="M6 12h12" />
    </svg>
  );
}

function BackIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function getInitials(name = "") {
  const parts = name.trim().split(" ").filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function ClientChat() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [coaches, setCoaches] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [conversationId, setConversationId] = useState("");
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const bottomRef = useRef(null);

  const selectedCoachId = searchParams.get("coach") || "";
  const selectedCoach = coaches.find((coach) => coach.id === selectedCoachId);

  const conversationByCoachId = useMemo(() => {
    return Object.fromEntries(
      conversations.map((conversation) => [
        conversation.coachId,
        conversation,
      ])
    );
  }, [conversations]);

  const sortedCoaches = useMemo(() => {
    return [...coaches].sort((a, b) => {
      const aConversation = conversationByCoachId[a.id];
      const bConversation = conversationByCoachId[b.id];
      const unreadDifference =
        (bConversation?.clientUnread || 0) - (aConversation?.clientUnread || 0);
      if (unreadDifference) return unreadDifference;

      const recentDifference =
        (bConversation?.updatedAt?.toMillis?.() || 0) -
        (aConversation?.updatedAt?.toMillis?.() || 0);
      if (recentDifference) return recentDifference;

      return a.name.localeCompare(b.name, "sr");
    });
  }, [coaches, conversationByCoachId]);

  useEffect(() => {
    const coachesQuery = query(
      collection(db, "users"),
      where("role", "==", "admin")
    );

    return onSnapshot(coachesQuery, (snap) => {
      setCoaches(
        snap.docs.map((d) => {
          const coach = d.data();
          return {
            id: d.id,
            name:
              `${coach.name || ""} ${coach.surname || ""}`.trim() || "Trener",
          };
        })
      );
    });
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    const conversationsQuery = query(
      collection(db, "conversations"),
      where("clientId", "==", user.uid)
    );

    return onSnapshot(conversationsQuery, (snap) => {
      setConversations(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [user?.uid]);

  useEffect(() => {
    let active = true;

    async function loadConversation() {
      if (!user?.uid || !selectedCoachId) {
        setConversationId("");
        setMessages([]);
        return;
      }

      const id = await ensureConversation({
        clientId: user.uid,
        coachId: selectedCoachId,
      });
      if (active) setConversationId(id || "");
    }

    loadConversation();
    return () => {
      active = false;
    };
  }, [user?.uid, selectedCoachId]);

  useEffect(() => {
    if (!conversationId) return;
    const messagesQuery = query(
      collection(db, "messages"),
      where("conversationId", "==", conversationId),
      orderBy("createdAt", "asc")
    );

    return onSnapshot(messagesQuery, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    updateDoc(doc(db, "conversations", conversationId), {
      clientUnread: 0,
    }).catch(() => {});
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    if (!text.trim() || !user?.uid || !selectedCoachId) return;
    const message = text.trim();
    setText("");

    const id = await ensureConversation({
      clientId: user.uid,
      coachId: selectedCoachId,
    });
    if (!id) return;

    await addDoc(collection(db, "messages"), {
      conversationId: id,
      senderId: user.uid,
      text: message,
      createdAt: serverTimestamp(),
    });

    await updateDoc(doc(db, "conversations", id), {
      lastMessage: message,
      lastSenderId: user.uid,
      updatedAt: serverTimestamp(),
      coachUnread: increment(1),
      clientUnread: 0,
    });
  }

  if (!selectedCoachId) {
    return (
      <div className="px-1 py-1">
        <h2 className="mb-4 text-lg font-semibold text-white">Treneri</h2>
        <div className="space-y-3">
          {sortedCoaches.map((coach) => {
            const conversation = conversationByCoachId[coach.id];
            const unread = conversation?.clientUnread || 0;

            return (
              <button
                key={coach.id}
                onClick={() => setSearchParams({ coach: coach.id })}
                className="flex w-full items-center gap-3 rounded-lg bg-neutral-900/75 p-4 text-left transition hover:bg-neutral-800"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-700 text-sm font-medium text-white">
                  {getInitials(coach.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-white">
                    {coach.name}
                  </span>
                  {conversation?.lastMessage && (
                    <span className="mt-0.5 block truncate text-xs text-neutral-400">
                      {conversation.lastMessage}
                    </span>
                  )}
                </span>
                {unread > 0 && (
                  <span className="shrink-0 rounded-full bg-blue-600 px-2 py-0.5 text-xs text-white">
                    {unread}
                  </span>
                )}
              </button>
            );
          })}
          {!coaches.length && (
            <p className="text-sm text-neutral-300">Nema dostupnih trenera.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border-dark px-2 py-2">
        <button
          onClick={() => setSearchParams({})}
          aria-label="Nazad na listu trenera"
          className="flex h-9 w-9 shrink-0 items-center justify-center text-neutral-300 transition hover:text-white"
        >
          <BackIcon className="h-5 w-5" />
        </button>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-700 text-sm font-medium text-white">
          {getInitials(selectedCoach?.name || "Trener")}
        </div>
        <p className="min-w-0 truncate text-sm font-medium text-white">
          {selectedCoach?.name || "Trener"}
        </p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.map((message) => {
          const mine = message.senderId === user.uid;
          return (
            <div
              key={message.id}
              className={`max-w-[78%] px-4 py-2 text-sm leading-relaxed ${
                mine
                  ? "ml-auto rounded-2xl rounded-br-sm bg-blue-600 text-white"
                  : "mr-auto rounded-2xl rounded-bl-sm bg-neutral-800 text-neutral-100"
              }`}
            >
              <p>{message.text}</p>
              <p className="text-[10px] opacity-60">
                {message.createdAt?.toDate?.().toLocaleTimeString("sr-RS", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2 border-t border-neutral-800 p-1">
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Napisi poruku..."
          className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-neutral-400"
        />
        <button onClick={send} aria-label="Posalji poruku" className="flex h-10 w-10 items-center justify-center rounded-full bg-black transition">
          <SendIcon className={`h-5 w-5 ${text.trim() ? "text-blue-400" : "text-neutral-400"}`} />
        </button>
      </div>
    </div>
  );
}
