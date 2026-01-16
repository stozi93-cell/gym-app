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
import { useParams } from "react-router-dom";

export default function AdminChat() {
  const { conversationId } = useParams();

  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");

  const bottomRef = useRef(null);

  /* ─────────────────────────────
     Listen to messages
  ───────────────────────────── */
  useEffect(() => {
    const q = query(
      collection(db, "messages"),
      where("conversationId", "==", conversationId),
      orderBy("createdAt", "asc")
    );

    const unsub = onSnapshot(q, (snap) => {
      setMessages(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      );

      // mark as read for coach
      updateDoc(doc(db, "conversations", conversationId), {
        coachUnread: 0,
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
      senderId: "admin",
      text: msg,
      createdAt: serverTimestamp(),
    });

    await updateDoc(doc(db, "conversations", conversationId), {
      lastMessage: msg,
      lastSenderId: "admin",
      updatedAt: serverTimestamp(),
      clientUnread: increment(1),
    });
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-neutral-900">
      <div className="border-b border-neutral-800 px-4 py-3 text-white text-sm">
        Chat
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((m) => {
          const mine = m.senderId === "admin";
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

      <div className="border-t border-neutral-800 p-3 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Napiši poruku…"
          className="flex-1 rounded-xl bg-neutral-800 px-4 py-2 text-sm text-white"
        />
        <button
          onClick={send}
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm text-white"
        >
          Pošalji
        </button>
      </div>
    </div>
  );
}
