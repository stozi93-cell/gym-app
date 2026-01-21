const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const { sendToUsers } = require("../utils/sendToUsers");

exports.newBooking = onDocumentCreated("bookings/{id}", async (event) => {
  const booking = event.data.data();

  const admins = await admin
    .firestore()
    .collection("users")
    .where("role", "==", "admin")
    .get();

  await sendToUsers({
    usersSnap: admins,
    type: "NEW_BOOKING",
    title: "📅 Nova rezervacija",
    body: "Klijent je rezervisao trening.",
    target: "/raspored",
  });
});
