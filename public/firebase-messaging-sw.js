self.addEventListener('install',  () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(clients.claim()))

self.addEventListener('push', event => {
  let raw = {}
  try { raw = event.data?.json() ?? {} } catch {}

  const payload = (raw.data && typeof raw.data === 'object') ? raw.data : raw
  const title = payload.title || 'Asistencia CIC'
  const body  = payload.body  || ''
  const url   = payload.url   || '/'
  const tag   = payload.tag   || 'cic'

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body,
        icon:     '/pwa-192x192.png',
        badge:    '/favicon.png',
        data:     { url, tag },
        tag,
        renotify: true,
      }),
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
        clientList.forEach(c => c.postMessage({ type: 'FCM_MESSAGE', title, body, url, tag }))
      }),
    ])
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const fullUrl = self.location.origin + (event.notification.data?.url || '/')

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ('focus' in client) {
          return client.focus().then(c => {
            if (c && 'navigate' in c) return c.navigate(fullUrl)
          })
        }
      }
      return clients.openWindow(fullUrl)
    })
  )
})
