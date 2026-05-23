importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyDEIuLRlI3H-lnYMG2fIvjzpg_mvMWFZBo",
  authDomain: "camp-2026-ea14a.firebaseapp.com",
  projectId: "camp-2026-ea14a",
  storageBucket: "camp-2026-ea14a.firebasestorage.app",
  messagingSenderId: "77260355004",
  appId: "1:77260355004:web:1920a543c5021e100e67b9"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icon.png',
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
