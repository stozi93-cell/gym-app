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
import Avatar from "../components/Avatar";
import ChatComposer from "../components/chat/ChatComposer";
import MessageBubble from "../components/chat/MessageBubble";
import {
  markConversationRead,
  getChatSendErrorMessage,
  sendChatMessage,
  setMessageReaction,
} from "../chat/messageTracking";
import {
  formatDayLabel,
  getDayKey,
} from "../chat/messageDisplay";

function BackIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export default function AdminChat() {
  const { conversationId } = useParams();
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("Klijent");
  const [clientPhotoURL, setClientPhotoURL] = useState("");
  const bottomRef = useRef(null);
  const sendingRef = useRef(false);
  const messageCountRef = useRef(0);

  useEffect(() => {
    async function loadConversation() {
      if (!conversationId) return;
      const snap = await getDoc(doc(db, "conversations", conversationId));
      if (snap.exists()) setClientId(snap.data().clientId || "");
    }

    loadConversation();
  }, [conversationId]);

  useEffect(() => {
    if (!clientId) return;
    return onSnapshot(doc(db, "users", clientId), (snap) => {
      if (!snap.exists()) return;
      const profile = snap.data();
      setClientName(
        `${profile.name || ""} ${profile.surname || ""}`.trim() || "Klijent"
      );
      setClientPhotoURL(profile.photoURL || "");
    });
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
    if (messages.length > messageCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    messageCountRef.current = messages.length;
  }, [messages.length]);

  async function send() {
    if ((!text.trim() && !selectedFile) || !user?.uid || !conversationId || !clientId || sendingRef.current) return false;

    const message = text.replace(/\r\n/g, "\n");
    const cleanMessage = message.trim() ? message.trimEnd() : "";
    const fileToSend = selectedFile;

    sendingRef.current = true;
    setSending(true);
    setSendError("");
    setText("");
    setSelectedFile(null);

    try {
      await sendChatMessage({
        conversationId,
        senderId: user.uid,
        recipientId: clientId,
        text: cleanMessage,
        attachmentFile: fileToSend,
        recipientUnreadField: "clientUnread",
        senderUnreadField: "coachUnread",
      });
      return true;
    } catch (error) {
      console.error("Admin chat send failed", error);
      setText((currentText) => currentText || message);
      setSelectedFile((currentFile) => currentFile || fileToSend);
      setSendError(getChatSendErrorMessage(error));
      return false;
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  async function reactToMessage(message, emoji) {
    try {
      await setMessageReaction({
        messageId: message.id,
        userId: user.uid,
        emoji,
        currentEmoji: message.reactions?.[user.uid],
      });
    } catch (error) {
      console.error("Admin chat reaction failed", error);
      setSendError("Reakcija nije sačuvana. Pokušaj ponovo.");
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
          <Avatar name={clientName} photoURL={clientPhotoURL} className="h-9 w-9 transition group-hover:ring-2 group-hover:ring-blue-500" />
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
              <MessageBubble
                message={message}
                mine={mine}
                currentUserId={user?.uid}
                onReact={reactToMessage}
              />
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <ChatComposer
        text={text}
        setText={setText}
        selectedFile={selectedFile}
        setSelectedFile={setSelectedFile}
        sending={sending}
        sendError={sendError}
        onSend={send}
        onFileError={setSendError}
      />
    </div>
  );
}
