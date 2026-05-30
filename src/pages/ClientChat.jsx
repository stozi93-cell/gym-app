import { useEffect, useRef, useState } from "react";
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
  const [conversationId, setConversationId] = useState("");
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef(null);

  const selectedCoachId = searchParams.get("coach") || "";
  const selectedCoach = coaches.find((coach) => coach.id === selectedCoachId);

  useEffect(() => {
    const coachesQuery = query(
      collection(db, "users"),
      where("role", "==", "admin")
    );

    return onSnapshot(coachesQuery, (snap) => {
      const nextCoaches = snap.docs.map((d) => {
        const coach = d.data();
        return {
          id: d.id,
          name:
            `${coach.name || ""} ${coach.surname || ""}`.trim() || "Trener",
        };
      });

      setCoaches(nextCoaches);

      if (
        nextCoaches.length &&
        !nextCoaches.some((coach) => coach.id === selectedCoachId)
      ) {
        setSearchParams({ coach: nextCoaches[0].id }, { replace: true });
      }
    });
  }, [selectedCoachId, setSearchParams]);

  useEffect(() => {
    let active = true;

    async function loadConversation() {
      if (!user?.uid || !selectedCoachId) return;
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
      setLoading(false);
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

  if (!coaches.length) {
    return <p className="text-sm text-neutral-300">Nema dostupnih trenera.</p>;
  }

  if (loading && conversationId) return null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border-dark px-4 py-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-700 text-sm font-medium text-white">
          {getInitials(selectedCoach?.name || "Trener")}
        </div>
        <p className="min-w-0 truncate text-sm font-medium text-white">
          {selectedCoach?.name || "Trener"}
        </p>
        <select
          aria-label="Izaberi trenera"
          value={selectedCoachId}
          onChange={(event) =>
            setSearchParams({ coach: event.target.value }, { replace: true })
          }
          className="ml-auto max-w-[45%] rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-white outline-none"
        >
          {coaches.map((coach) => (
            <option key={coach.id} value={coach.id}>
              {coach.name}
            </option>
          ))}
        </select>
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
