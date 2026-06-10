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

function ArrowDownIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 5v14" />
      <path d="m19 12-7 7-7-7" />
    </svg>
  );
}

export default function AdminChat() {
  const { conversationId } = useParams();
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("Klijent");
  const [clientPhotoURL, setClientPhotoURL] = useState("");
  const bottomRef = useRef(null);
  const messagesRef = useRef(null);
  const sendingRef = useRef(false);
  const messageCountRef = useRef(0);
  const isNearBottomRef = useRef(true);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);

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
    const firstLoad = messageCountRef.current === 0;

    if (messages.length > messageCountRef.current && (firstLoad || isNearBottomRef.current)) {
      scrollToBottom("smooth");
    } else if (messages.length > messageCountRef.current) {
      setShowJumpToBottom(true);
    }
    messageCountRef.current = messages.length;
  }, [messages.length]);

  function handleMessagesScroll() {
    const container = messagesRef.current;
    if (!container) return;

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const nearBottom = distanceFromBottom < 180;
    isNearBottomRef.current = nearBottom;
    setShowJumpToBottom(!nearBottom);
  }

  function scrollToBottom(behavior = "smooth") {
    bottomRef.current?.scrollIntoView({ behavior });
    isNearBottomRef.current = true;
    setShowJumpToBottom(false);
  }

  async function send() {
    if ((!text.trim() && selectedFiles.length === 0) || !user?.uid || !conversationId || !clientId || sendingRef.current) return false;

    const message = text.replace(/\r\n/g, "\n");
    const cleanMessage = message.trim() ? message.trimEnd() : "";
    const filesToSend = selectedFiles;
    let remainingFiles = filesToSend;
    let textWasSent = false;

    sendingRef.current = true;
    setSending(true);
    setSendError("");
    setText("");
    setSelectedFiles([]);

    try {
      if (filesToSend.length > 0) {
        for (const [index, file] of filesToSend.entries()) {
          await sendChatMessage({
            conversationId,
            senderId: user.uid,
            recipientId: clientId,
            text: index === 0 ? cleanMessage : "",
            attachmentFile: file,
            recipientUnreadField: "clientUnread",
            senderUnreadField: "coachUnread",
          });
          remainingFiles = filesToSend.slice(index + 1);
          if (index === 0 && cleanMessage) textWasSent = true;
        }
      } else {
        await sendChatMessage({
          conversationId,
          senderId: user.uid,
          recipientId: clientId,
          text: cleanMessage,
          recipientUnreadField: "clientUnread",
          senderUnreadField: "coachUnread",
        });
        textWasSent = true;
      }
      return true;
    } catch (error) {
      console.error("Admin chat send failed", error);
      if (!textWasSent) {
        setText((currentText) => currentText || message);
      }
      setSelectedFiles((currentFiles) => currentFiles.length ? currentFiles : remainingFiles);
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
    <div className="relative flex h-full flex-col">
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

      <div ref={messagesRef} onScroll={handleMessagesScroll} className="flex-1 space-y-3 overflow-y-auto px-4 py-4 scrollbar-none">
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

      {showJumpToBottom && (
        <button
          type="button"
          onClick={() => scrollToBottom("smooth")}
          aria-label="Idi na kraj razgovora"
          className="absolute bottom-16 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-neutral-700 bg-neutral-950/95 text-neutral-200 shadow-xl transition hover:text-white"
        >
          <ArrowDownIcon className="h-5 w-5" />
        </button>
      )}

      <ChatComposer
        text={text}
        setText={setText}
        selectedFiles={selectedFiles}
        setSelectedFiles={setSelectedFiles}
        sending={sending}
        sendError={sendError}
        onSend={send}
        onFileError={setSendError}
      />
    </div>
  );
}
