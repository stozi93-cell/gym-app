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

function ArrowDownIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 5v14" />
      <path d="m19 12-7 7-7-7" />
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
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const bottomRef = useRef(null);
  const messagesRef = useRef(null);
  const sendingRef = useRef(false);
  const messageCountRef = useRef(0);
  const isNearBottomRef = useRef(true);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [newMessagesCount, setNewMessagesCount] = useState(0);

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
    const previousCount = messageCountRef.current;
    const firstLoad = previousCount === 0;
    const addedCount = Math.max(messages.length - previousCount, 0);

    if (messages.length > previousCount && (firstLoad || isNearBottomRef.current)) {
      scrollToBottom("smooth");
    } else if (messages.length > previousCount) {
      setShowJumpToBottom(true);
      setNewMessagesCount((count) => count + addedCount);
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
    if (nearBottom) setNewMessagesCount(0);
  }

  function scrollToBottom(behavior = "smooth") {
    bottomRef.current?.scrollIntoView({ behavior });
    isNearBottomRef.current = true;
    setShowJumpToBottom(false);
    setNewMessagesCount(0);
  }

  async function send() {
    if ((!text.trim() && selectedFiles.length === 0) || !user?.uid || !selectedCoachId || sendingRef.current) return false;

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
      const id = await ensureConversation({
        clientId: user.uid,
        coachId: selectedCoachId,
      });
      if (!id) throw new Error("Conversation could not be created");

      if (filesToSend.length > 0) {
        for (const [index, file] of filesToSend.entries()) {
          await sendChatMessage({
            conversationId: id,
            senderId: user.uid,
            recipientId: selectedCoachId,
            text: index === 0 ? cleanMessage : "",
            attachmentFile: file,
            recipientUnreadField: "coachUnread",
            senderUnreadField: "clientUnread",
          });
          remainingFiles = filesToSend.slice(index + 1);
          if (index === 0 && cleanMessage) textWasSent = true;
        }
      } else {
        await sendChatMessage({
          conversationId: id,
          senderId: user.uid,
          recipientId: selectedCoachId,
          text: cleanMessage,
          recipientUnreadField: "coachUnread",
          senderUnreadField: "clientUnread",
        });
        textWasSent = true;
      }
      return true;
    } catch (error) {
      console.error("Client chat send failed", error);
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
    <div className="relative flex h-full flex-col">
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

      <div ref={messagesRef} onScroll={handleMessagesScroll} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
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

      {showJumpToBottom && (
        <button
          type="button"
          onClick={() => scrollToBottom("smooth")}
          aria-label="Idi na kraj razgovora"
          className="absolute bottom-16 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-neutral-700/60 bg-neutral-950/45 text-neutral-200 shadow-lg backdrop-blur-sm transition hover:bg-neutral-950/70 hover:text-white"
        >
          <ArrowDownIcon className="h-5 w-5" />
          {newMessagesCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-medium text-white">
              {newMessagesCount > 9 ? "9+" : newMessagesCount}
            </span>
          )}
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
