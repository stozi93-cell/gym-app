import { useEffect, useMemo, useRef, useState } from "react";
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
import ScrollArea from "../components/ui/ScrollArea";
import {
  PinnedMessagesButton,
  PinnedMessagesPanel,
} from "../components/chat/PinnedMessagesPanel";
import {
  markConversationRead,
  getChatSendErrorMessage,
  sendChatMessage,
  setMessageReaction,
  editChatMessage,
  toggleMessagePin,
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
  const [replyTo, setReplyTo] = useState(null);
  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("Klijent");
  const [clientPhotoURL, setClientPhotoURL] = useState("");
  const bottomRef = useRef(null);
  const messagesRef = useRef(null);
  const messageRefs = useRef({});
  const sendingRef = useRef(false);
  const messageCountRef = useRef(0);
  const isNearBottomRef = useRef(true);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [newMessagesCount, setNewMessagesCount] = useState(0);
  const [pinnedOpen, setPinnedOpen] = useState(false);

  const pinnedMessages = useMemo(() => {
    return messages
      .filter((message) => message.pinned)
      .sort(
        (a, b) =>
          (b.createdAt?.toMillis?.() || 0) -
          (a.createdAt?.toMillis?.() || 0)
      );
  }, [messages]);

  useEffect(() => {
    if (!pinnedMessages.length) setPinnedOpen(false);
  }, [pinnedMessages.length]);

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

  function jumpToPinnedMessage(message) {
    messageRefs.current[message.id]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    setPinnedOpen(false);
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
            replyTo: index === 0 ? replyTo : null,
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
          replyTo,
        });
        textWasSent = true;
      }
      setReplyTo(null);
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

  function replyToMessage(message) {
    const mine = message.senderId === user.uid || message.senderId === "admin";
    setReplyTo({
      messageId: message.id,
      senderId: message.senderId,
      senderName: mine ? "ti" : clientName,
      text: message.text || "",
      attachmentName: message.attachment?.name || "",
    });
  }

  async function copyMessage(message) {
    const value = message.text || message.attachment?.url || "";
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
      setSendError("");
    } catch (error) {
      console.error("Admin chat copy failed", error);
      setSendError("Poruka nije kopirana. Pokušaj ponovo.");
    }
  }

  async function pinMessage(message) {
    try {
      await toggleMessagePin({ messageId: message.id, pinned: message.pinned });
    } catch (error) {
      console.error("Admin chat pin failed", error);
      setSendError("Poruka nije pinovana. Pokušaj ponovo.");
    }
  }

  async function editMessage(message, nextText) {
    try {
      await editChatMessage({
        messageId: message.id,
        userId: user.uid,
        text: nextText,
      });
    } catch (error) {
      console.error("Admin chat edit failed", error);
      setSendError("Poruka nije izmenjena. Pokušaj ponovo.");
    }
  }

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-white/10 bg-neutral-950/80 px-4 py-2 backdrop-blur-xl">
        <Link
          to="/poruke"
          aria-label="Nazad na poruke"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-neutral-300 transition hover:bg-white/10 hover:text-white"
        >
          <BackIcon className="h-5 w-5" />
        </Link>
        <Link to={`/profil/${clientId}`} className="group flex min-w-0 flex-1 items-center gap-3">
          <Avatar name={clientName} photoURL={clientPhotoURL} className="h-9 w-9 transition group-hover:ring-2 group-hover:ring-brand-blue-500" />
          <p className="min-w-0 truncate text-sm font-medium text-white group-hover:underline">
            {clientName}
          </p>
        </Link>
        <PinnedMessagesButton
          count={pinnedMessages.length}
          open={pinnedOpen}
          onToggle={() => setPinnedOpen((open) => !open)}
        />
      </div>

      {pinnedOpen && (
        <PinnedMessagesPanel
          messages={pinnedMessages}
          onSelect={jumpToPinnedMessage}
          onUnpin={pinMessage}
        />
      )}

      <ScrollArea
        viewportRef={messagesRef}
        onScroll={handleMessagesScroll}
        containerClassName="min-h-0 flex-1"
        className="h-full space-y-3 px-4 py-4 scrollbar-none"
        endShadowClassName="inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/70 via-black/30 to-transparent"
      >
        {messages.map((message, index) => {
          const mine = message.senderId === user?.uid || message.senderId === "admin";
          const showDay =
            index === 0 ||
            getDayKey(message.createdAt) !== getDayKey(messages[index - 1].createdAt);
          return (
            <div
              key={message.id}
              ref={(node) => {
                if (node) messageRefs.current[message.id] = node;
                else delete messageRefs.current[message.id];
              }}
            >
              {showDay && (
                <div className="my-3 text-center text-[11px] text-neutral-400">
                  {formatDayLabel(message.createdAt)}
                </div>
              )}
              <MessageBubble
                message={message}
                mine={mine}
                onReact={reactToMessage}
                onReply={replyToMessage}
                onCopy={copyMessage}
                onPin={pinMessage}
                onEdit={editMessage}
              />
            </div>
          );
        })}
        <div ref={bottomRef} />
      </ScrollArea>

      {showJumpToBottom && (
        <button
          type="button"
          onClick={() => scrollToBottom("smooth")}
          aria-label="Idi na kraj razgovora"
          className="absolute bottom-16 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-neutral-700/60 bg-neutral-950/45 text-neutral-200 shadow-lg backdrop-blur-sm transition hover:bg-neutral-950/70 hover:text-white"
        >
          <ArrowDownIcon className="h-5 w-5" />
          {newMessagesCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-blue-500 px-1 text-[10px] font-medium text-white">
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
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
      />
    </div>
  );
}
