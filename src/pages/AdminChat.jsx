import { useEffect, useRef, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { Link, useParams } from "react-router-dom";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";

function SendIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M6 12L3 21l18-9L3 3l3 9z" />
      <path d="M6 12h12" />
    </svg>
  );
}

function getInitials(name = "Klijent") {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

export default function AdminChat() {
  const { conversationId } = useParams();
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("Klijent");
  const bottomRef = useRef(null);

  useEffect(() => {
    async function loadConversation() {
      if (!conversationId) return;
      const snap = await getDoc(doc(db, "conversations", conversationId));
      if (snap.exists()) setClientId(snap.data().clientId || "");
    }

    loadConversation();
  }, [conversationId]);

  useEffect(() => {
    async function loadClient() {
      if (!clientId) return;
      const snap = await getDoc(doc(db, "users", clientId));
      if (!snap.exists()) return;
      const profile = snap.data();
      setClientName(
        `${profile.name || ""} ${profile.surname || ""}`.trim() || "Klijent"
      );
    }

    loadClient();
  }, [clientId]);

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
      coachUnread: 0,
    }).catch(() => {});
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    if (!text.trim() || !user?.uid || !conversationId) return;
    const message = text.trim();
    setText("");

    await addDoc(collection(db, "messages"), {
      conversationId,
      senderId: user.uid,
      text: message,
      createdAt: serverTimestamp(),
    });

    await updateDoc(doc(db, "conversations", conversationId), {
      lastMessage: message,
      lastSenderId: user.uid,
      updatedAt: serverTimestamp(),
      clientUnread: increment(1),
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border-dark px-4 py-2">
        <Link to={`/profil/${clientId}`} className="group flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-700 text-sm font-medium text-white transition group-hover:ring-2 group-hover:ring-blue-500">
            {getInitials(clientName)}
          </div>
          <p className="text-sm font-medium text-white group-hover:underline">
            {clientName}
          </p>
        </Link>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 scrollbar-none">
        {messages.map((message) => {
          const mine = message.senderId === user?.uid || message.senderId === "admin";
          return (
            <div
              key={message.id}
              className={`max-w-[78%] px-4 py-1.5 text-sm leading-relaxed ${
                mine
                  ? "ml-auto rounded-2xl rounded-br-sm bg-blue-600 text-white"
                  : "mr-auto rounded-2xl rounded-bl-sm bg-neutral-800 text-neutral-100"
              }`}
            >
              <p>{message.text}</p>
              <p className="mt-1 text-right text-[10px] opacity-60">
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
