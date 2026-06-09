const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

exports.notifyChatMessage = onDocumentCreated(
  "messages/{messageId}",
  async (event) => {
    try {
      const message = event.data?.data();
      if (!message || message._notified) return;

      const { senderId, text = "", conversationId, attachment } = message;
      if (!senderId || !conversationId) return;

      const db = admin.firestore();
      const conversationSnap = await db.doc(`conversations/${conversationId}`).get();
      if (!conversationSnap.exists) return;

      const { clientId, coachId } = conversationSnap.data();
      const recipientId = senderId === clientId ? coachId : clientId;
      if (!recipientId) return;

      const recipientSnap = await db.doc(`users/${recipientId}`).get();
      if (!recipientSnap.exists) return;

      const recipient = recipientSnap.data();
      const tokens = recipient.fcmTokens || [];
      if (!tokens.length) return;

      let fullName = "Nova poruka";
      const senderSnap = await db.doc(`users/${senderId}`).get();
      if (senderSnap.exists) {
        const sender = senderSnap.data();
        fullName =
          [sender.name, sender.surname].filter(Boolean).join(" ") || fullName;
      }

      const preview =
        typeof text === "string" && text.trim()
          ? text.slice(0, 80) + (text.length > 80 ? "..." : "")
          : attachment?.type === "image"
            ? "Poslata je slika."
            : attachment?.name
              ? `Poslat je fajl: ${attachment.name}`
              : "Nova poruka";

      const response = await admin.messaging().sendEachForMulticast({
        tokens,
        data: {
          type: "CHAT_MESSAGE",
          target:
            recipient.role === "admin"
              ? `/admin-chat/${conversationId}`
              : `/chat?coach=${coachId}`,
          title: `Poruka: ${fullName}`,
          body: preview,
        },
      });

      await event.data.ref.update({ _notified: true });

      console.log(
        `Chat notification: ${response.successCount} delivered, ${response.failureCount} failed`
      );

      const invalidTokens = [];
      response.responses.forEach((result, index) => {
        if (!result.success) {
          console.warn(
            "Chat notification failed",
            tokens[index]?.slice(-8),
            result.error?.code
          );

          if (
            result.error?.code === "messaging/registration-token-not-registered" ||
            result.error?.code === "messaging/invalid-registration-token"
          ) {
            invalidTokens.push(tokens[index]);
          }
        }
      });

      if (invalidTokens.length) {
        await recipientSnap.ref.update({
          fcmTokens: admin.firestore.FieldValue.arrayRemove(...invalidTokens),
        });
      }
    } catch (err) {
      console.error("notifyChatMessage failed", err);
    }
  }
);
