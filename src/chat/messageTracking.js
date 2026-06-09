import {
  collection,
  deleteField,
  doc,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "../firebase";

const deliveryWrites = new Set();
const readWrites = new Set();
export const REACTION_OPTIONS = ["👍", "❤️", "💪", "🔥", "😂"];

const DOCUMENT_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
]);

const EXTENSION_CONTENT_TYPES = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain",
  csv: "text/csv",
};

function getFileContentType(file) {
  if (file.type) return file.type;
  const extension = file.name?.split(".").pop()?.toLowerCase();
  return EXTENSION_CONTENT_TYPES[extension] || "";
}

function sanitizeFileName(name = "file") {
  return name.replace(/[^\w.\-() ]+/g, "_").slice(0, 120) || "file";
}

function getAttachmentType(file) {
  if (getFileContentType(file).startsWith("image/")) return "image";
  return "file";
}

export function isAllowedChatAttachment(file) {
  if (!file) return false;
  const contentType = getFileContentType(file);
  if (contentType.startsWith("video/")) return false;
  return contentType.startsWith("image/") || DOCUMENT_TYPES.has(contentType);
}

async function uploadChatAttachment({ conversationId, messageId, file }) {
  if (!isAllowedChatAttachment(file)) {
    throw new Error("CHAT_ATTACHMENT_NOT_ALLOWED");
  }

  const path = `chatAttachments/${conversationId}/${messageId}/${Date.now()}_${sanitizeFileName(file.name)}`;
  const attachmentRef = ref(storage, path);
  const contentType = getFileContentType(file) || "application/octet-stream";

  await uploadBytes(attachmentRef, file, {
    contentType,
    cacheControl: "public,max-age=3600",
  });

  return {
    name: file.name,
    size: file.size,
    contentType,
    type: getAttachmentType(file),
    path,
    url: await getDownloadURL(attachmentRef),
  };
}

export async function sendChatMessage({
  conversationId,
  senderId,
  recipientId,
  text,
  attachmentFile = null,
  recipientUnreadField,
  senderUnreadField,
}) {
  const messageRef = doc(collection(db, "messages"));
  const conversationRef = doc(db, "conversations", conversationId);
  const batch = writeBatch(db);
  const cleanText = typeof text === "string" ? text : "";
  const attachment = attachmentFile
    ? await uploadChatAttachment({
        conversationId,
        messageId: messageRef.id,
        file: attachmentFile,
      })
    : null;
  const lastMessage =
    cleanText.trim() ||
    (attachment?.type === "image"
      ? "Slika"
      : attachment
        ? `Fajl: ${attachment.name}`
        : "");

  batch.set(messageRef, {
    conversationId,
    senderId,
    recipientId,
    text: cleanText,
    ...(attachment ? { attachment } : {}),
    createdAt: serverTimestamp(),
  });

  batch.update(conversationRef, {
    lastMessage,
    lastSenderId: senderId,
    updatedAt: serverTimestamp(),
    [recipientUnreadField]: increment(1),
    [senderUnreadField]: 0,
  });

  await batch.commit();
}

export async function setMessageReaction({ messageId, userId, emoji, currentEmoji }) {
  if (!messageId || !userId || !REACTION_OPTIONS.includes(emoji)) return;

  await updateDoc(doc(db, "messages", messageId), {
    [`reactions.${userId}`]: currentEmoji === emoji ? deleteField() : emoji,
  });
}

export function getMessageReactionCounts(reactions = {}) {
  const counts = {};
  Object.values(reactions).forEach((emoji) => {
    if (!emoji) return;
    counts[emoji] = (counts[emoji] || 0) + 1;
  });

  return REACTION_OPTIONS
    .filter((emoji) => counts[emoji])
    .map((emoji) => ({ emoji, count: counts[emoji] }));
}

export function listenForDeliveredMessages(userId) {
  if (!userId) return () => {};

  const messagesQuery = query(
    collection(db, "messages"),
    where("recipientId", "==", userId)
  );

  return onSnapshot(messagesQuery, async (snap) => {
    const pending = snap.docs.filter((messageDoc) => {
      const message = messageDoc.data();
      return !message.deliveredAt && !message.readAt && !deliveryWrites.has(messageDoc.id);
    });

    if (!pending.length) return;
    pending.forEach((messageDoc) => deliveryWrites.add(messageDoc.id));

    try {
      for (let index = 0; index < pending.length; index += 400) {
        const batch = writeBatch(db);
        pending.slice(index, index + 400).forEach((messageDoc) => {
          batch.update(messageDoc.ref, { deliveredAt: serverTimestamp() });
        });
        await batch.commit();
      }
    } finally {
      pending.forEach((messageDoc) => deliveryWrites.delete(messageDoc.id));
    }
  });
}

export async function markConversationRead({
  conversationId,
  currentUserId,
  unreadField,
  messageDocs,
}) {
  if (!conversationId || !currentUserId || readWrites.has(conversationId)) return;

  const unreadMessages = messageDocs.filter((messageDoc) => {
    const message = messageDoc.data();
    return message.senderId !== currentUserId && !message.readAt;
  });

  readWrites.add(conversationId);
  try {
    const chunks = unreadMessages.length
      ? Array.from(
          { length: Math.ceil(unreadMessages.length / 400) },
          (_, index) => unreadMessages.slice(index * 400, index * 400 + 400)
        )
      : [[]];

    for (const chunk of chunks) {
      const batch = writeBatch(db);
      batch.update(doc(db, "conversations", conversationId), {
        [unreadField]: 0,
      });

      chunk.forEach((messageDoc) => {
        const message = messageDoc.data();
        batch.update(messageDoc.ref, {
          deliveredAt: message.deliveredAt || serverTimestamp(),
          readAt: serverTimestamp(),
        });
      });

      await batch.commit();
    }
  } finally {
    readWrites.delete(conversationId);
  }
}
