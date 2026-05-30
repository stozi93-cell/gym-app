const admin = require("firebase-admin");
admin.initializeApp();

exports.sendAnnouncementNotification =
  require("./notifications/announcement").sendAnnouncementNotification;

exports.notifyAdminBookingCreated =
  require("./notifications/bookingCreated").notifyAdminBookingCreated;

exports.bookingCanceledByClient =
  require("./notifications/bookingCanceled").bookingCanceledByClient;

exports.notifyChatMessage =
  require("./notifications/chatMessage").notifyChatMessage;

exports.notifySubscriptionExpiry =
  require("./notifications/subscriptionExpiry")
    .notifySubscriptionExpiry;

exports.bookSlot =
  require("./bookings/bookSlot").bookSlot;

exports.checkInBooking =
  require("./bookings/checkInBooking").checkInBooking;

exports.cleanupOldBookings =
  require("./bookings/cleanupOldBookings").cleanupOldBookings;

