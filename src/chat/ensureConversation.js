import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

/**
 * Ensures a conversation exists for a client.
 * conversationId === clientId
 */
export async function ensureConversation({
  clientId,
  coachId,
}) {
  if (!clientId || !coachId) return;

  const ref = doc(db, "conversations", clientId);
  const snap = await getDoc(ref);

  if (snap.exists()) return;

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
