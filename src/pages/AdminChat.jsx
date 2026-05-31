import { useEffect, useRef, useState } from "react";
import {
  collection,
  getDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { Link, useParams } from "react-router-dom";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import {
  markConversationRead,
  sendChatMessage,
} from "../chat/messageTracking";
import {
  formatDayLabel,
  formatMessageTime,
  getDayKey,
  getMessageStatus,
} from "../chat/messageDisplay";

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

function getInitials(name = "Klijent") {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

export default function AdminChat() {
  const { conversationId } = useParams();
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("Klijent");
  const bottomRef = useRef(null);
  const sendingRef = useRef(false);

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
      markConversationRead({
        conversationId,
        currentUserId: user?.uid,
        unreadField: "coachUnread",
        messageDocs: snap.docs,
      }).catch((error) => console.error("Admin chat read update failed", error));
    });
  }, [conversationId, user?.uid]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    if (!text.trim() || !user?.uid || !conversationId || !clientId || sendingRef.current) return;
    const message = text.trim();
    sendingRef.current = true;
    setSending(true);
    setSendError("");
    setText("");

    try {
      await sendChatMessage({
        conversationId,
        senderId: user.uid,
        recipientId: clientId,
        text: message,
        recipientUnreadField: "clientUnread",
        senderUnreadField: "coachUnread",
      });
    } catch (error) {
      console.error("Admin chat send failed", error);
      setText((currentText) => currentText || message);
      setSendError("Poruka nije poslata. Pokušaj ponovo.");
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border-dark px-4 py-2">
        <Link
          to="/poruke"
          aria-label="Nazad na poruke"
          className="flex h-9 w-9 shrink-0 items-center justify-center text-neutral-300 transition hover:text-white"
        >
          <BackIcon className="h-5 w-5" />
        </Link>
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
        {messages.map((message, index) => {
          const mine = message.senderId === user?.uid || message.senderId === "admin";
          const showDay =
            index === 0 ||
            getDayKey(message.createdAt) !== getDayKey(messages[index - 1].createdAt);
          return (
            <div key={message.id}>
              {showDay && (
                <div className="my-3 text-center text-[11px] text-neutral-400">
                  {formatDayLabel(message.createdAt)}
                </div>
              )}
              <div
                className={`max-w-[78%] px-4 py-1.5 text-sm leading-relaxed ${
                  mine
                    ? "ml-auto rounded-2xl rounded-br-sm bg-blue-600 text-white"
                    : "mr-auto rounded-2xl rounded-bl-sm bg-neutral-800 text-neutral-100"
                }`}
              >
                <p>{message.text}</p>
                <p className="mt-1 text-right text-[10px] opacity-60">
                  {formatMessageTime(message.createdAt)}
                  {mine && ` · ${getMessageStatus(message)}`}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2 border-t border-neutral-800 p-1">
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          placeholder="Napiši poruku..."
          className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-neutral-400"
        />
        <button disabled={sending} onClick={send} aria-label="Pošalji poruku" className="flex h-10 w-10 items-center justify-center rounded-full bg-black transition disabled:opacity-50">
          <SendIcon className={`h-5 w-5 ${text.trim() ? "text-blue-400" : "text-neutral-400"}`} />
        </button>
      </div>
      {sendError && (
        <p className="px-2 pb-1 text-xs text-red-300">{sendError}</p>
      )}
    </div>
  );
}
