self.addEventListener('push', function (event) {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      data: { url: data.url },
    })
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const targetUrl = event.notification.data?.url || 'https://www.gytennis.or.kr/daily/4';
  event.waitUntil(clients.openWindow(targetUrl));
});
