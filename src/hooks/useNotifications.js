import { useState, useEffect, useCallback } from 'react'
import { getToken, deleteToken } from 'firebase/messaging'
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore'
import { messaging, db } from '../firebase'
import { useAuth } from '../context/AuthContext'

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY

async function getFcmRegistration() {
  return navigator.serviceWorker.register('/firebase-messaging-sw.js')
}

export function useNotifications() {
  const { user, profile, refreshProfile } = useAuth()

  const [permission,    setPermission]    = useState(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  )
  const [currentToken, setCurrentToken] = useState(null)
  const [loading,      setLoading]      = useState(false)

  const isSupported =
    typeof Notification !== 'undefined' &&
    'serviceWorker' in navigator &&
    !!messaging

  // Si ya hay permiso, recuperar el token actual del dispositivo
  useEffect(() => {
    if (!isSupported || Notification.permission !== 'granted') return
    let cancelled = false
    getFcmRegistration()
      .then(reg => getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg }))
      .then(tok  => { if (!cancelled && tok) setCurrentToken(tok) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [isSupported])

  // ¿El token actual está guardado en el perfil? → notis activas
  const isActive = !!currentToken && (profile?.fcmTokens || []).includes(currentToken)

  const enable = useCallback(async () => {
    if (!isSupported || !user?.uid) return
    setLoading(true)
    try {
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') return
      const reg = await getFcmRegistration()
      const tok = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg })
      console.log('[NOTIF] token generado:', tok)
      if (tok) {
        setCurrentToken(tok)
        await updateDoc(doc(db, 'leaders', user.uid), { fcmTokens: arrayUnion(tok) })
        await refreshProfile()
        console.log('[NOTIF] token guardado en Firestore ✅')
      } else {
        console.warn('[NOTIF] getToken devolvió null/vacío')
      }
    } catch (e) {
      console.error('Error al activar notificaciones:', e)
    } finally {
      setLoading(false)
    }
  }, [isSupported, user, refreshProfile])

  const disable = useCallback(async () => {
    if (!currentToken || !user?.uid) return
    setLoading(true)
    try {
      await updateDoc(doc(db, 'leaders', user.uid), { fcmTokens: arrayRemove(currentToken) })
      try { await deleteToken(messaging) } catch {}
      setCurrentToken(null)
      await refreshProfile()
    } catch (e) {
      console.error('Error al desactivar notificaciones:', e)
    } finally {
      setLoading(false)
    }
  }, [currentToken, user, refreshProfile])

  return { permission, isActive, isSupported, loading, enable, disable }
}
