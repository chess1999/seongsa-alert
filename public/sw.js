self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || '성사전천후 알림', {
      body: data.body || '',
      data: { url: data.url || 'https://www.gytennis.or.kr/daily/4' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || 'https://www.gytennis.or.kr/daily/4';
  event.waitUntil(clients.openWindow(targetUrl));
});
