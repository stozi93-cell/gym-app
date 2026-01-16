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

export default function ClientChat() {
  const { user, profile } = useAuth();

  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);

  const bottomRef = useRef(null);

  const conversationId = user?.uid;

  /* ─────────────────────────────
     Ensure conversation exists
  ───────────────────────────── */
  useEffect(() => {
    if (!user?.uid || !profile?.coachId) return;

    ensureConversation({
      clientId: user.uid,
      coachId: profile.coachId,
    });
  }, [user?.uid, profile?.coachId]);

  /* ─────────────────────────────
     Listen to messages
  ───────────────────────────── */
  useEffect(() => {
    if (!conversationId) return;

    const q = query(
      collection(db, "messages"),
      where("conversationId", "==", conversationId),
      orderBy("createdAt", "asc")
    );

    const unsub = onSnapshot(q, (snap) => {
      setMessages(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      );
      setLoading(false);

      // mark as read for client
      updateDoc(doc(db, "conversations", conversationId), {
        clientUnread: 0,
      });
    });

    return () => unsub();
  }, [conversationId]);

  /* ─────────────────────────────
     Auto-scroll
  ───────────────────────────── */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ─────────────────────────────
     Send message
  ───────────────────────────── */
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

  if (loading) {
    return <div className="p-6 text-neutral-400">Učitavanje poruka…</div>;
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-neutral-900">

      {/* HEADER */}
      <div className="border-b border-neutral-800 px-4 py-3 text-center text-sm font-medium text-white">
        Chat sa trenerom
      </div>

      {/* MESSAGES */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((m) => {
          const mine = m.senderId === user.uid;
          return (
            <div
              key={m.id}
              className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                mine
                  ? "ml-auto bg-blue-600 text-white"
                  : "mr-auto bg-neutral-800 text-neutral-100"
              }`}
            >
              <div className="space-y-1">
                <p>{m.text}</p>
                <p className="text-[10px] opacity-60">
                  {m.createdAt?.toDate?.().toLocaleTimeString("sr-RS", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* INPUT */}
      <div className="border-t border-neutral-800 p-3 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Napiši poruku…"
          className="flex-1 rounded-xl bg-neutral-800 px-4 py-2 text-sm text-white outline-none"
        />
        <button
          onClick={send}
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white"
        >
          Pošalji
        </button>
      </div>
    </div>
  );
}
