const admin = require("firebase-admin");
admin.initializeApp();

/* ─────────────────────────────
   ANNOUNCEMENTS
───────────────────────────── */
exports.sendAnnouncementNotification =
  require("./notifications/announcement")
    .sendAnnouncementNotification;

/* ─────────────────────────────
   BOOKINGS
───────────────────────────── */
exports.notifyAdminBookingCreated =
  require("./notifications/bookingCreated")
    .notifyAdminBookingCreated;

exports.notifyBookingCanceled =
  require("./notifications/bookingCanceled")
    .notifyBookingCanceled;

exports.bookingReminder =
  require("./notifications/bookingReminder")
    .bookingReminder;
