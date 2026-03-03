import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { collection, getDocs, doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from './AuthContext'
import { isBirthdaySoon, isBirthdayToday, ageFrom, formatBirthday, localDateStr, todayStr } from '../utils/dates'
import { memberInAnyGroup, getMemberGroupIds } from '../utils/members'

const AlertContext = createContext(null)

export function AlertProvider({ children }) {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'

  const [alerts,    setAlerts]    = useState([])
  // Dismissed state is in-memory only — resets every time the app is opened
  const [dismissed, setDismissed] = useState({})
  const [loading,   setLoading]   = useState(true)

  const loadAlerts = useCallback(async () => {
    if (!profile) { setLoading(false); return }
    setLoading(true)
    try {
      const cfgSnap = await getDoc(doc(db, 'config', 'general'))
      const cfg = cfgSnap.exists() ? cfgSnap.data() : {}
      const absenceWeeks = cfg.absenceAlertWeeks || 2

      const mSnap = await getDocs(collection(db, 'members'))
      let members = mSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(m => m.active !== false)
      if (!isAdmin) {
        const gids = profile?.groupIds || []
        members = members.filter(m => memberInAnyGroup(m, gids))
      }

      const aSnap = await getDocs(collection(db, 'attendance'))
      let attDocs = aSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      if (!isAdmin) {
        const gids = profile?.groupIds || []
        attDocs = attDocs.filter(d => gids.includes(d.groupId))
      }
      attDocs.sort((a, b) => (b.date || '').localeCompare(a.date || ''))

      const alertList = []

      // 1. Birthday alerts
      members.forEach(m => {
        if (!m.birthDate) return
        const isToday = isBirthdayToday(m.birthDate)
        const isSoon  = isBirthdaySoon(m.birthDate, 7)
        if (isToday || isSoon) {
          const age = ageFrom(m.birthDate)
          alertList.push({
            type:     'birthday',
            priority: isToday ? 0 : 1,
            label:    isToday
              ? `¡Hoy cumple ${age} años!`
              : `Cumpleaños el ${formatBirthday(m.birthDate)}`,
            name:     m.fullName,
            phone:    m.phone,
            memberId: m.id,
            alertKey: `birthday_${m.id}_${m.birthDate?.slice(5)}`,
            isToday,
          })
        }
      })

      // 2. Absence alerts — only meetings where the member has an explicit record (avoids joinDate false negatives)
      members.forEach(m => {
        const memberGroups = getMemberGroupIds(m)
        const groupDocs = attDocs.filter(r => {
          if (r.groupId && memberGroups.length > 0 && !memberGroups.includes(r.groupId)) return false
          return true
        })
        // Only docs where this member was explicitly recorded (present or absent)
        const memberDocs = groupDocs.filter(r => m.id in (r.records || {}))
        if (memberDocs.length < absenceWeeks) return
        const consecutive = memberDocs.slice(0, absenceWeeks).every(rec => {
          const st = rec.records[m.id]
          return !st || st === 'absent'
        })
        if (consecutive) {
          alertList.push({
            type:     'absence',
            priority: 2,
            label:    `Ausente ${absenceWeeks} reunión${absenceWeeks > 1 ? 'es' : ''} consecutiva${absenceWeeks > 1 ? 's' : ''}`,
            name:     m.fullName,
            phone:    m.phone,
            memberId: m.id,
            alertKey: `absence_${m.id}`,
          })
        }
      })

      // 3. Visitor follow-up alerts — isolated so a failure here doesn't block birthday/absence alerts
      try {
        const vSnap = await getDocs(collection(db, 'visitors'))
        let visitors = vSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(v => v.status !== 'converted')
        if (!isAdmin) {
          const gids = profile?.groupIds || []
          visitors = visitors.filter(v => gids.includes(v.groupId))
        }
        const sevenStr = localDateStr(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
        visitors.forEach(v => {
          const notes = v.notes || []
          const lastNote = notes.length > 0 ? notes[notes.length - 1] : null
          if (!lastNote || lastNote.date < sevenStr) {
            const daysSince = lastNote
              ? Math.round((new Date(todayStr()) - new Date(lastNote.date)) / (1000 * 60 * 60 * 24))
              : null
            alertList.push({
              type:      'visitor',
              priority:  3,
              label:     lastNote ? `Sin seguimiento hace ${daysSince} días` : 'Sin seguimiento registrado',
              name:      v.name,
              phone:     v.phone,
              visitorId: v.id,
              alertKey:  `visitor_${v.id}`,
            })
          }
        })
      } catch (vErr) {
        console.warn('AlertContext: no se pudieron cargar alertas de visitantes:', vErr)
      }

      alertList.sort((a, b) => a.priority - b.priority || (a.name || '').localeCompare(b.name || '', 'es'))
      setAlerts(alertList)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [profile, isAdmin])

  useEffect(() => { loadAlerts() }, [loadAlerts])

  // Refresh when the app comes back to the foreground (PWA / tab switch)
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') loadAlerts() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [loadAlerts])

  function dismissAlert(key) {
    setDismissed(prev => ({ ...prev, [key]: true }))
  }

  function dismissAll(keys) {
    setDismissed(prev => {
      const next = { ...prev }
      keys.forEach(key => { next[key] = true })
      return next
    })
  }

  const visibleAlerts = alerts.filter(a => !dismissed[a.alertKey])

  return (
    <AlertContext.Provider value={{
      alerts,
      dismissed,
      loading,
      visibleAlerts,
      alertCount: visibleAlerts.length,
      dismissAlert,
      dismissAll,
      refreshAlerts: loadAlerts,
    }}>
      {children}
    </AlertContext.Provider>
  )
}

export function useAlerts() {
  return useContext(AlertContext)
}
