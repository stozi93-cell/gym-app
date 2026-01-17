import { useEffect, useRef, useState } from "react";
import {
  collection,
  addDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  increment,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { ensureConversation } from "../chat/ensureConversation";

function getInitials(name = "Trener") {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function ClientChat() {
  const { user, profile } = useAuth();

  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const bottomRef = useRef(null);

  const conversationId = user?.uid;

  /* Ensure conversation exists */
  useEffect(() => {
    if (!user?.uid || !profile?.coachId) return;
    ensureConversation({ clientId: user.uid, coachId: profile.coachId });
  }, [user?.uid, profile?.coachId]);

  /* Listen to messages */
  useEffect(() => {
    if (!conversationId) return;

    const q = query(
      collection(db, "messages"),
      where("conversationId", "==", conversationId),
      orderBy("createdAt", "asc")
    );

    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      updateDoc(doc(db, "conversations", conversationId), {
        clientUnread: 0,
      });
    });

    return () => unsub();
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    if (!text.trim()) return;
    const msg = text.trim();
    setText("");

    await addDoc(collection(db, "messages"), {
      conversationId,
      senderId: user.uid,
      text: msg,
      createdAt: serverTimestamp(),
    });

    await updateDoc(doc(db, "conversations", conversationId), {
      lastMessage: msg,
      lastSenderId: user.uid,
      updatedAt: serverTimestamp(),
      coachUnread: increment(1),
    });
  }

  return (
    <div className="flex h-full flex-col">

      {/* HEADER (under global top bar) */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border-dark">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-700 text-sm font-medium text-white">
          {getInitials("Trener")}
        </div>
        <div>
          <p className="text-sm font-medium text-white">Trener</p>
          <p className="text-xs text-neutral-400">Direktna poruka</p>
        </div>
      </div>

      {/* MESSAGES (ONLY SCROLL AREA) */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scrollbar-none">
        {messages.map((m) => {
          const mine = m.senderId === user.uid;
          return (
            <div
              key={m.id}
              className={`max-w-[78%] px-4 py-2 text-sm leading-relaxed ${
                mine
                  ? "ml-auto bg-blue-600 text-white rounded-2xl rounded-br-sm"
                  : "mr-auto bg-neutral-800 text-neutral-100 rounded-2xl rounded-bl-sm"
              }`}
            >
              <p>{m.text}</p>
              <p className="mt-1 text-[10px] opacity-60 text-right">
                {m.createdAt?.toDate?.().toLocaleTimeString("sr-RS", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* INPUT (above BottomNav) */}
      <div className="flex gap-2 items-center px-3 py-2 border-t border-border-dark">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Napiši poruku…"
          className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-neutral-400"
        />
        <button
          onClick={send}
          className="text-sm font-medium text-blue-400"
        >
          Pošalji
        </button>
      </div>
    </div>
  );
}
