import { ensureConversation } from "./ensureConversation";

/**
 * Opens client chat safely.
 * Guarantees conversation exists BEFORE navigation.
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

  // 🔒 This is the critical line
  await ensureConversation({ clientId, coachId });

  // ✅ Only now we navigate
  navigate("/chat");
}
