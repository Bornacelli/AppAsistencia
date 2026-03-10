importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey:            'AIzaSyCsCvRBu4GoerOfxZjRrg2BocgusGfN69E',
  authDomain:        'app-asistencia-26cda.firebaseapp.com',
  projectId:         'app-asistencia-26cda',
  storageBucket:     'app-asistencia-26cda.firebasestorage.app',
  messagingSenderId: '586913678849',
  appId:             '1:586913678849:web:ff06cb7d0e2902a382a200',
})

const messaging = firebase.messaging()

// Notificaciones en background (app cerrada o en segundo plano)
messaging.onBackgroundMessage(payload => {
  const notification = payload.notification || {}
  const data         = payload.data         || {}
  self.registration.showNotification(notification.title || 'Asistencia CIC', {
    body:    notification.body,
    icon:    '/pwa-192x192.png',
    badge:   '/favicon.png',
    data,
    tag:     data.tag || 'cic',
    renotify: true,
  })
})

// Al tocar la notificación, abre la app en la ruta correspondiente
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
