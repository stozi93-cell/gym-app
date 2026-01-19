/* eslint-disable no-undef */

// Firebase Messaging Service Worker
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js");

// IMPORTANT: use the SAME config as firebase.js
firebase.initializeApp({
  apiKey: "AIzaSyCzIFe3t8HT8QXJSrwaZhB0aLlUsn3HpPk",
  authDomain: "gym-booking-a75f8.firebaseapp.com",
  projectId: "gym-booking-a75f8",
  storageBucket: "gym-booking-a75f8.firebasestorage.app",
  messagingSenderId: "489815738954",
  appId: "1:489815738954:web:3a8fa96e3cfe65f5dbb4b3",
});

const messaging = firebase.messaging();

// Optional: background notification handler
messaging.onBackgroundMessage((payload) => {
  console.log(
    "[firebase-messaging-sw.js] Received background message ",
    payload
  );

  const { title, body } = payload.notification || {};

  self.registration.showNotification(title || "ReMotion", {
    body: body || "Nova notifikacija",
    icon: "/brand/icon.png",
  });
});
