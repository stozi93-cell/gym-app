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
  getDoc, // 👈 added
} from "firebase/firestore";
import { db } from "../firebase";
import { useParams } from "react-router-dom";
import { Link } from "react-router-dom";

function SendIcon({ className }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M6 12L3 21l18-9L3 3l3 9z" />
      <path d="M6 12h12" />
    </svg>
  );
}

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
  const [clientName, setClientName] = useState("Klijent"); // 👈 added

  const bottomRef = useRef(null);

  /* ─────────────────────────────
     Load client name
  ───────────────────────────── */
  useEffect(() => {
    async function loadClient() {
      if (!conversationId) return;

      const snap = await getDoc(doc(db, "users", conversationId));
      if (snap.exists()) {
        const u = snap.data();
        const fullName =
          `${u.name || ""} ${u.surname || ""}`.trim() || "Klijent";
        setClientName(fullName);
      }
    }

    loadClient();
  }, [conversationId]);

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

      {/* HEADER */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border-dark">
  <Link
    to={`/profil/${conversationId}`}
    className="flex items-center gap-3 group"
  >
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-700 text-sm font-medium text-white group-hover:ring-2 group-hover:ring-blue-500 transition">
      {getInitials(clientName || "Klijent")}
    </div>
    <div>
      <p className="text-sm font-medium text-white group-hover:underline">
        {clientName || "Klijent"}
      </p>
    </div>
  </Link>
</div>


      {/* MESSAGES */}
      
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scrollbar-none">
        {messages.map((m) => {
          const mine = m.senderId === "admin";
          return (
            <div
              key={m.id}
              className={`max-w-[78%] px-4 py-1.5 text-sm leading-relaxed ${
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

      {/* INPUT */}
      <div className="border-t border-neutral-800 p-1 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Napiši poruku…"
          className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-neutral-400"
        />
        <button
          onClick={send}
          className={`
            flex h-10 w-10 items-center justify-center 
            rounded-full bg-black transition 
            ${text.trim() ? "shadow-[0_0_0_1px_rgba(59,130,246,0.4)]" : ""}
          `}
        >
          <SendIcon
  className={`h-5 w-5 ${
    text.trim() ? "text-blue-400" : "text-neutral-400"
  }`}
/>

        </button>
      </div>
    </div>
  );
}
