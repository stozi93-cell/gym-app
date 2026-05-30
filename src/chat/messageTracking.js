import {
  collection,
  doc,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";

const deliveryWrites = new Set();
const readWrites = new Set();

export async function sendChatMessage({
  conversationId,
  senderId,
  recipientId,
  text,
  recipientUnreadField,
  senderUnreadField,
}) {
  const messageRef = doc(collection(db, "messages"));
  const conversationRef = doc(db, "conversations", conversationId);
  const batch = writeBatch(db);

  batch.set(messageRef, {
    conversationId,
    senderId,
    recipientId,
    text,
    createdAt: serverTimestamp(),
  });

  batch.update(conversationRef, {
    lastMessage: text,
    lastSenderId: senderId,
    updatedAt: serverTimestamp(),
    [recipientUnreadField]: increment(1),
    [senderUnreadField]: 0,
  });

  await batch.commit();
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
