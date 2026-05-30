import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

/**
 * Keeps old one-coach conversations readable while new coach chats receive
 * a stable per-client-and-coach document ID.
 */
export async function ensureConversation({ clientId, coachId }) {
  if (!clientId || !coachId) return null;

  const legacyRef = doc(db, "conversations", clientId);
  const legacySnap = await getDoc(legacyRef);

  if (legacySnap.exists() && legacySnap.data().coachId === coachId) {
    return clientId;
  }

  const conversationId = `${clientId}_${coachId}`;
  const ref = doc(db, "conversations", conversationId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      clientId,
      coachId,
      lastMessage: "",
      lastSenderId: "",
      updatedAt: serverTimestamp(),
      clientUnread: 0,
      coachUnread: 0,
    });
  }

  return conversationId;
}
