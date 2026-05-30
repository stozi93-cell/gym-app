import { ensureConversation } from "./ensureConversation";

/**
 * Opens a selected coach conversation after its Firestore document exists.
 */
export async function openClientChat({
  clientId,
  coachId,
  navigate,
}) {
  if (!clientId || !coachId) {
    console.warn("[Chat] Missing clientId or coachId");
    return;
  }

  await ensureConversation({ clientId, coachId });
  navigate(`/chat?coach=${coachId}`);
}
