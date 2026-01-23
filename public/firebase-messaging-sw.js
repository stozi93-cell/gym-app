importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCzIFe3t8HT8QXJSrwaZhB0aLlUsn3HpPk",
  authDomain: "gym-booking-a75f8.firebaseapp.com",
  projectId: "gym-booking-a75f8",
  storageBucket: "gym-booking-a75f8.firebasestorage.app",
  messagingSenderId: "489815738954",
  appId: "1:489815738954:web:3a8fa96e3cfe65f5dbb4b3",
});

const messaging = firebase.messaging();

/* BACKGROUND MESSAGE */
messaging.onBackgroundMessage((payload) => {
  console.log("[SW] Background message received:", payload);

  const title = payload.data?.title || "NO_TITLE";
  const body = payload.data?.body || "NO_BODY";

  self.registration.showNotification(title, {
    body,
    icon: "/brand/icon-192.png",
    badge: "/brand/icon-192.png",
    data: {
      target: payload.data?.target || "/",
    },
  });
});

/* CLICK HANDLER */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = event.notification.data?.target || "/";
  const url = new URL(target, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.startsWith(self.location.origin)) {
            return client.focus();
          }
        }
        return clients.openWindow(url);
      })
  );
});
