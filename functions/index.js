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
  require("./notifications/subscriptionExpiry").notifySubscriptionExpiry;


