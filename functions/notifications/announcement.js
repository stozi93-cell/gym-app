const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const { getTokensFromUserData, send } = require("./_helpers");

exports.sendAnnouncementNotification = onDocumentCreated(
    "forumPosts/{postId}",
  async (event) => {
    const post = event.data?.data();
    if (!post || post.archived) return;

    // prevent duplicate fire
    if (post._notified) return;

    const usersSnap = await admin.firestore().collection("users").get();
    const tokens = usersSnap.docs.flatMap((d) =>
      getTokensFromUserData(d.data(), "ANNOUNCEMENT")
    );
    if (!tokens.length) return;

    await send(tokens, {
      type: "ANNOUNCEMENT",
      target: "/forum",
      title: `📢 ${post.title}`,
      body: post.content?.slice(0, 120) || "",
    });

    // mark as sent
    await event.data.ref.update({ _notified: true });

    console.log("📢 Announcement sent");
  }
);
