import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { useSearchParams } from "react-router-dom";
import { db } from "../firebase";
import { ensureConversation } from "../chat/ensureConversation";
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

export default function ClientChat() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [coaches, setCoaches] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [conversationId, setConversationId] = useState("");
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const bottomRef = useRef(null);
  const sendingRef = useRef(false);
  const messageCountRef = useRef(0);

  const selectedCoachId = searchParams.get("coach") || "";
  const selectedCoach = coaches.find((coach) => coach.id === selectedCoachId);

  const conversationByCoachId = useMemo(() => {
    return Object.fromEntries(
      conversations.map((conversation) => [
        conversation.coachId,
        conversation,
      ])
    );
  }, [conversations]);

  const sortedCoaches = useMemo(() => {
    return [...coaches].sort((a, b) => {
      const aConversation = conversationByCoachId[a.id];
      const bConversation = conversationByCoachId[b.id];
      const unreadDifference =
        (bConversation?.clientUnread || 0) - (aConversation?.clientUnread || 0);
      if (unreadDifference) return unreadDifference;

      const recentDifference =
        (bConversation?.updatedAt?.toMillis?.() || 0) -
        (aConversation?.updatedAt?.toMillis?.() || 0);
      if (recentDifference) return recentDifference;

      return a.name.localeCompare(b.name, "sr");
    });
  }, [coaches, conversationByCoachId]);

  useEffect(() => {
    const coachesQuery = query(
      collection(db, "users"),
      where("role", "==", "admin")
    );

    return onSnapshot(coachesQuery, (snap) => {
      setCoaches(
        snap.docs.map((d) => {
          const coach = d.data();
          return {
            id: d.id,
            name:
              `${coach.name || ""} ${coach.surname || ""}`.trim() || "Trener",
            photoURL: coach.photoURL || "",
          };
        })
      );
    });
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    const conversationsQuery = query(
      collection(db, "conversations"),
      where("clientId", "==", user.uid)
    );

    return onSnapshot(conversationsQuery, (snap) => {
      setConversations(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [user?.uid]);

  useEffect(() => {
    let active = true;

    async function loadConversation() {
      if (!user?.uid || !selectedCoachId) {
        setConversationId("");
        setMessages([]);
        return;
      }

      const id = await ensureConversation({
        clientId: user.uid,
        coachId: selectedCoachId,
      });
      if (active) setConversationId(id || "");
    }

    loadConversation();
    return () => {
      active = false;
    };
  }, [user?.uid, selectedCoachId]);

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
        unreadField: "clientUnread",
        messageDocs: snap.docs,
      }).catch((error) => console.error("Client chat read update failed", error));
    });
  }, [conversationId, user?.uid]);

  useEffect(() => {
    if (messages.length > messageCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    messageCountRef.current = messages.length;
  }, [messages.length]);

  async function send() {
    if ((!text.trim() && !selectedFile) || !user?.uid || !selectedCoachId || sendingRef.current) return false;

    const message = text.replace(/\r\n/g, "\n");
    const cleanMessage = message.trim() ? message.trimEnd() : "";
    const fileToSend = selectedFile;

    sendingRef.current = true;
    setSending(true);
    setSendError("");
    setText("");
    setSelectedFile(null);

    try {
      const id = await ensureConversation({
        clientId: user.uid,
        coachId: selectedCoachId,
      });
      if (!id) throw new Error("Conversation could not be created");

      await sendChatMessage({
        conversationId: id,
        senderId: user.uid,
        recipientId: selectedCoachId,
        text: cleanMessage,
        attachmentFile: fileToSend,
        recipientUnreadField: "coachUnread",
        senderUnreadField: "clientUnread",
      });
      return true;
    } catch (error) {
      console.error("Client chat send failed", error);
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
      console.error("Client chat reaction failed", error);
      setSendError("Reakcija nije sačuvana. Pokušaj ponovo.");
    }
  }

  if (!selectedCoachId) {
    return (
      <div className="px-1 py-1">
        <h2 className="mb-4 text-lg font-semibold text-white">Treneri</h2>
        <div className="space-y-3">
          {sortedCoaches.map((coach) => {
            const conversation = conversationByCoachId[coach.id];
            const unread = conversation?.clientUnread || 0;

            return (
              <button
                key={coach.id}
                onClick={() => setSearchParams({ coach: coach.id })}
                className="flex w-full items-center gap-3 rounded-lg bg-neutral-900/75 p-4 text-left transition hover:bg-neutral-800"
              >
                <Avatar name={coach.name} photoURL={coach.photoURL} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-white">
                    {coach.name}
                  </span>
                  {conversation?.lastMessage && (
                    <span className="mt-0.5 block truncate text-xs text-neutral-400">
                      {conversation.lastMessage}
                    </span>
                  )}
                </span>
                {unread > 0 && (
                  <span className="shrink-0 rounded-full bg-blue-600 px-2 py-0.5 text-xs text-white">
                    {unread}
                  </span>
                )}
              </button>
            );
          })}
          {!coaches.length && (
            <p className="text-sm text-neutral-300">Nema dostupnih trenera.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border-dark px-2 py-2">
        <button
          onClick={() => setSearchParams({})}
          aria-label="Nazad na listu trenera"
          className="flex h-9 w-9 shrink-0 items-center justify-center text-neutral-300 transition hover:text-white"
        >
          <BackIcon className="h-5 w-5" />
        </button>
        <Avatar name={selectedCoach?.name || "Trener"} photoURL={selectedCoach?.photoURL} className="h-9 w-9" />
        <p className="min-w-0 truncate text-sm font-medium text-white">
          {selectedCoach?.name || "Trener"}
        </p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.map((message, index) => {
          const mine = message.senderId === user.uid;
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
                currentUserId={user.uid}
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
