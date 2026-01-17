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

function getInitials(name = "Klijent") {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function AdminChat() {
  const { conversationId } = useParams();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    const q = query(
      collection(db, "messages"),
      where("conversationId", "==", conversationId),
      orderBy("createdAt", "asc")
    );

    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      updateDoc(doc(db, "conversations", conversationId), {
        coachUnread: 0,
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
    <div className="flex h-full flex-col">

      <div className="flex items-center gap-3 px-4 py-3 border-b border-border-dark">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-700 text-sm font-medium text-white">
          {getInitials("Klijent")}
        </div>
        <div>
          <p className="text-sm font-medium text-white">Klijent</p>
          <p className="text-xs text-neutral-400">Direktna poruka</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scrollbar-none">
        {messages.map((m) => {
          const mine = m.senderId === "admin";
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

      <div className="flex gap-2 items-center px-3 py-2 border-t border-border-dark">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Napiši poruku…"
          className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-neutral-400"
        />
        <button
  onClick={send}
  className="
    flex h-10 w-14 items-center justify-center
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
