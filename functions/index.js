const { onDocumentCreated, onDocumentDeleted } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

admin.initializeApp();

/* ─────────────────────────────
   HELPERS
───────────────────────────── */

async function getUserTokens(uid) {
  const snap = await admin.firestore().doc(`users/${uid}`).get();
  if (!snap.exists()) return [];
  return snap.data().fcmTokens || [];
}

async function getAdminTokens() {
  const snap = await admin
    .firestore()
    .collection("users")
    .where("role", "==", "admin")
    .get();

  return snap.docs.flatMap(d => d.data().fcmTokens || []);
}

async function send(tokens, payload) {
  if (!tokens.length) return;

  await admin.messaging().sendEachForMulticast({
    tokens,
    data: payload,
  });
}

/* ─────────────────────────────
   ANNOUNCEMENTS (FORUM)
───────────────────────────── */

exports.sendAnnouncementNotification = onDocumentCreated(
  "forumPosts/{postId}",
  async (event) => {
    const post = event.data?.data();
    if (!post || post.archived) return;

    const usersSnap = await admin.firestore().collection("users").get();
    const tokens = usersSnap.docs.flatMap(d => d.data().fcmTokens || []);

    await send(tokens, {
      type: "ANNOUNCEMENT",
      target: "/forum",
      title: `📢 ${post.title}`,
      body: post.content?.slice(0, 120) || "",
    });

    console.log("✅ Announcement notification sent");
  }
);

/* ─────────────────────────────
   BOOKING CANCELED
   - client → admin
   - admin → client
───────────────────────────── */

exports.bookingCanceled = onDocumentDeleted(
  "bookings/{bookingId}",
  async (event) => {
    const booking = event.data?.data();
    if (!booking) return;

    const clientId = booking.userId;

    // client
    const clientTokens = await getUserTokens(clientId);

    // admin
    const adminTokens = await getAdminTokens();

    // notify client
    await send(clientTokens, {
      type: "BOOKING_CANCELED",
      target: "/",
      title: "❌ Rezervacija otkazana",
      body: "Vaša rezervacija je otkazana.",
    });

    // notify admin
    await send(adminTokens, {
      type: "BOOKING_CANCELED_ADMIN",
      target: "/",
      title: "❌ Otkazana rezervacija",
      body: "Klijent je otkazao rezervaciju.",
    });

    console.log("✅ Booking cancel notifications sent");
  }
);
