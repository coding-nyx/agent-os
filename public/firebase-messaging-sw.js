/**
 * firebase-messaging-sw.js
 * Firebase Cloud Messaging service worker — handles background push messages.
 *
 * NOTE: This file is processed by the Vite `firebase-sw-inject` plugin at
 * build time. The __FIREBASE_*__ tokens are replaced with real env var values.
 * In development the dev server generates a processed version of this file
 * on startup.
 *
 * Firebase 9 compat SDK is used here because service workers cannot use
 * ES-module syntax (no `import`) and the compat CDN scripts are still the
 * standard pattern for FCM service workers.
 */

/* global firebase */

importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// Activate this SW immediately on install and take control of all clients
// so notification click handlers work on first load without waiting for a tab reload.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (event) { event.waitUntil(clients.claim()); });

// Firebase config — injected at build time by Vite plugin.
// In development, the dev server writes a processed copy with real values.
var firebaseConfig = {
  apiKey: '__FIREBASE_API_KEY__',
  authDomain: '__FIREBASE_AUTH_DOMAIN__',
  projectId: '__FIREBASE_PROJECT_ID__',
  storageBucket: '__FIREBASE_STORAGE_BUCKET__',
  messagingSenderId: '__FIREBASE_MESSAGING_SENDER_ID__',
  appId: '__FIREBASE_APP_ID__',
};

firebase.initializeApp(firebaseConfig);

var messaging = firebase.messaging();

/**
 * Handle background FCM messages.
 * This fires when a push arrives while the app tab is hidden or closed.
 * The notification is shown as a native OS notification.
 */
messaging.onBackgroundMessage(function (payload) {
  console.log('[Bridge SW] Background message received:', payload);

  var notificationTitle = (payload.notification && payload.notification.title)
    ? payload.notification.title
    : 'Nexus Alert';

  var notificationBody = (payload.notification && payload.notification.body)
    ? payload.notification.body
    : '';

  var notificationOptions = {
    body: notificationBody,
    icon: '/assets/images/soma.png',
    badge: '/assets/images/soma.png',
    data: payload.data || {},
    tag: (payload.data && payload.data.eventType) ? payload.data.eventType : 'nexus-alert',
    renotify: true,
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

/**
 * Handle notification click — focus or open the app tab.
 */
self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (clientList) {
        var data = event.notification && event.notification.data ? event.notification.data : {};
        var deepLinkRoute = '/notifications';
        if (data.deepLink && typeof data.deepLink === 'string') {
          try {
            var parsed = JSON.parse(data.deepLink);
            if (parsed && typeof parsed.route === 'string' && parsed.route.length > 0) {
              deepLinkRoute = parsed.route;
            }
          } catch (e) {}
        } else if (typeof data.deepLinkRoute === 'string' && data.deepLinkRoute.length > 0) {
          deepLinkRoute = data.deepLinkRoute;
        }

        var targetUrl = self.location.origin + deepLinkRoute;

        // If an app tab is already open, navigate it to the deep link and focus.
        // client.navigate() is preferred; if unsupported we open a new window
        // so the deep link route is never silently dropped.
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          if ('navigate' in client) {
            return client.navigate(targetUrl).then(function (c) { return c && c.focus(); });
          }
        }
        // No existing tab or navigate() not supported — open a new window.
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});
