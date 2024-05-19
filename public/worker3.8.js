console.log('Loaded service worker 3.8!');

self.addEventListener('push', ev => {
  console.log("Received a push event", ev.data.json());
  const data = ev.data.json();
  //console.log('Got pushed', data, data.json(), data.title, data.body, JSON.parse(data).title);
  self.registration.showNotification(data.title, {
    body: data.body || 'Hello, World!',
    icon: './favicon.ico'
  });
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('https://meadowchat.madi-wka.xyz')
  );
});