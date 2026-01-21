const admin = require("firebase-admin");

module.exports.sendToUsers = async ({
  usersSnap,
  type,
  title,
  body,
  target,
}) => {
  const tokensMap = {};

  usersSnap.forEach((doc) => {
    tokensMap[doc.id] = doc.data().fcmTokens || [];
  });

  const tokens = Object.values(tokensMap).flat();
  if (!tokens.length) return;

  const response = await admin.messaging().sendEachForMulticast({
    tokens,
    data: { type, title, body, target },
  });

  const invalid = [];

  response.responses.forEach((r, i) => {
    if (!r.success) invalid.push(tokens[i]);
  });

  if (invalid.length) {
    for (const [uid, list] of Object.entries(tokensMap)) {
      const valid = list.filter((t) => !invalid.includes(t));
      await admin.firestore().doc(`users/${uid}`).update({
        fcmTokens: valid,
      });
    }
  }
};
