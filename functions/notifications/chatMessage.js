const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

exports.notifyChatMessage = onDocumentCreated(
  "messages/{messageId}",
  async (event) => {
    try {
      const message = event.data?.data();
      if (!message) return;
      if (message._notified) return;

      const { senderId, text = "", conversationId } = message;
      if (!senderId || !conversationId) return;

      const db = admin.firestore();

      /* ───── load conversation ───── */
      const convoSnap = await db
        .doc(`conversations/${conversationId}`)
        .get();

      if (!convoSnap.exists) return;

      const { clientId, coachId } = convoSnap.data();

      // never notify sender
      const recipientId =
        senderId === clientId ? coachId : clientId;

      if (!recipientId) return;

      /* ───── recipient tokens ───── */
      const recipientSnap = await db
        .doc(`users/${recipientId}`)
        .get();

      if (!recipientSnap.exists) return;

      const recipient = recipientSnap.data();
      const tokens = recipient.fcmTokens || [];
      if (!tokens.length) return;

      /* ───── sender name ───── */
      let fullName = "Nova poruka";
      const senderSnap = await db.doc(`users/${senderId}`).get();
      if (senderSnap.exists) {
        const u = senderSnap.data();
        fullName =
          [u.name, u.surname].filter(Boolean).join(" ") || fullName;
      }

      /* ───── message preview ───── */
      const preview =
        typeof text === "string"
          ? text.slice(0, 80) + (text.length > 80 ? "…" : "")
          : "Nova poruka";

      /* ───── send DATA-ONLY notification ───── */
      await admin.messaging().sendEachForMulticast({
        tokens,
        data: {
          type: "CHAT_MESSAGE",
          target: recipient.role === "admin" ? "/poruke" : "/chat",
          title: `💬 ${fullName}`,
          body: preview,
        },
      });

      await event.data.ref.update({ _notified: true });

      console.log("💬 Chat notification sent");
    } catch (err) {
      console.error("❌ notifyChatMessage failed", err);
    }
  }
);
