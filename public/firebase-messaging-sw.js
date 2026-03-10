// Maneja push notifications directamente sin depender del SDK de Firebase

self.addEventListener('push', event => {
  let payload = {}
  try { payload = event.data?.json() ?? {} } catch {}

  const notification = payload.notification || {}
  const data         = payload.data         || {}

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      const hasForeground = clientList.some(c => c.visibilityState === 'visible')

      if (hasForeground) {
        // App abierta → reenviar al foreground para que lo maneje
        clientList.forEach(c => c.postMessage({ type: 'FCM_MESSAGE', notification, data }))
        return
      }

      // App cerrada/minimizada → mostrar notificación del sistema
      return self.registration.showNotification(notification.title || 'Asistencia CIC', {
        body:     notification.body,
        icon:     '/pwa-192x192.png',
        badge:    '/favicon.png',
        data,
        tag:      data.tag || 'cic',
        renotify: true,
      })
    })
  )
})

// Al tocar la notificación → abre la app en la ruta correcta
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ('focus' in client) {
          client.focus()
          if ('navigate' in client) client.navigate(url)
          return
        }
      }
      return clients.openWindow(url)
    })
  )
})
