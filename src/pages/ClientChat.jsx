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
  const { user } = useAuth();

  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);

  const bottomRef = useRef(null);

  // conversationId === clientId
  const conversationId = user?.uid;

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
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    return () => unsub();
  }, [conversationId]);

  /* ─────────────────────────────
     Clear unread SAFELY on open
  ───────────────────────────── */
  useEffect(() => {
    if (!conversationId) return;

    updateDoc(doc(db, "conversations", conversationId), {
      clientUnread: 0,
    }).catch(() => {
      // conversation might not exist yet — ignore safely
    });
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
    if (!text.trim() || !user?.uid) return;

    const msg = text.trim();
    setText("");

    // 🔑 ensure conversation exists BEFORE updates
    await ensureConversation({
      clientId: user.uid,
      coachId: "A2g7h5o43mVc0bDGWM7al12bvPp1", // 👈 replace with your admin UID
    });

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
      clientUnread: 0,
    });
  }

  if (loading) {
    return (
      <div className="p-6 text-neutral-400">
        Učitavanje poruka…
      </div>
    );
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
              <p>{m.text}</p>
              <p className="text-[10px] opacity-60">
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

      {/* INPUT */}
      <div className="border-t border-neutral-800 p-3 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Napiši poruku…"
          className="flex-1 bg-transparent px-4 py-2 text-sm text-white outline-none"
        />
        <button
  onClick={send}
  className="
    flex h-9 w-9 items-center justify-center
    rounded-full
    text-blue-500 text-xl
    hover:bg-neutral-900
    transition
  "
  aria-label="Pošalji poruku"
>
  ➤
</button>

      </div>
    </div>
  );
}
