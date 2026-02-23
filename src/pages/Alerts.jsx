import { useState, useEffect } from 'react'
import { collection, getDocs, doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import { Bell, Cake, Warning, Handshake, WhatsappLogo } from '@phosphor-icons/react'
import { isBirthdaySoon, isBirthdayToday, ageFrom, formatDateShort, localDateStr, todayStr } from '../utils/dates'

export default function Alerts() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const [alerts,  setAlerts]  = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadAlerts() }, [profile])

  async function loadAlerts() {
    setLoading(true)
    try {
      // Load config
      const cfgSnap = await getDoc(doc(db, 'config', 'general'))
      const cfg = cfgSnap.exists() ? cfgSnap.data() : {}
      const absenceWeeks = cfg.absenceAlertWeeks || 2

      // Load members
      const mSnap = await getDocs(collection(db, 'members'))
      let members = mSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(m => m.active !== false)
      if (!isAdmin) {
        const gids = profile?.groupIds || []
        members = members.filter(m => gids.includes(m.groupId))
      }

      // Load attendance
      const aSnap = await getDocs(collection(db, 'attendance'))
      let attDocs = aSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      if (!isAdmin) {
        const gids = profile?.groupIds || []
        attDocs = attDocs.filter(d => gids.includes(d.groupId))
      }
      attDocs.sort((a, b) => (b.date || '').localeCompare(a.date || ''))

      // Load visitors
      const vSnap = await getDocs(collection(db, 'visitors'))
      let visitors = vSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(v => v.status !== 'converted')
      if (!isAdmin) {
        const gids = profile?.groupIds || []
        visitors = visitors.filter(v => gids.includes(v.groupId))
      }

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
              : `Cumpleaños el ${formatDateShort(m.birthDate?.slice(5).replace('-', '/') || '')}`,
            name:     m.fullName,
            phone:    m.phone,
            memberId: m.id,
            isToday,
          })
        }
      })

      // 2. Absence alerts
      if (attDocs.length >= absenceWeeks) {
        const recentDates = attDocs.slice(0, absenceWeeks).map(d => d.date)
        members.forEach(m => {
          const consecutive = recentDates.every(date => {
            const rec = attDocs.find(d => d.date === date)
            if (!rec) return true
            const st = rec.records?.[m.id]
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
            })
          }
        })
      }

      // 3. Visitor follow-up alerts
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
          })
        }
      })

      // Sort by priority then name
      alertList.sort((a, b) => a.priority - b.priority || (a.name || '').localeCompare(b.name || '', 'es'))
      setAlerts(alertList)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const typeConfig = {
    birthday: { icon: Cake,  color: 'var(--amber)', bg: 'var(--amber-bg)', bdr: 'var(--amber-bdr)', title: 'Cumpleaños' },
    absence:  { icon: Warning,    color: 'var(--red)',   bg: 'var(--red-bg)',   bdr: 'var(--red-bdr)',   title: 'Inasistencias' },
    visitor:  { icon: Handshake,  color: 'var(--accent)', bg: 'rgba(59,130,246,0.08)', bdr: 'rgba(59,130,246,0.2)', title: 'Seguimiento visitantes' },
  }

  const grouped = alerts.reduce((acc, a) => {
    if (!acc[a.type]) acc[a.type] = []
    acc[a.type].push(a)
    return acc
  }, {})

  return (
    <div className="flex flex-col" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <h1 className="font-syne font-extrabold text-[17px]" style={{ color: 'var(--text)' }}>Alertas</h1>
        {alerts.length > 0 && (
          <span className="w-6 h-6 rounded-full text-[11px] font-extrabold flex items-center justify-center"
            style={{ background: 'var(--red)', color: 'white' }}>{alerts.length}</span>
        )}
      </div>

      <div className="px-4 py-4 flex flex-col gap-5">
        {loading ? <LoadingSpinner /> : alerts.length === 0 ? (
          <EmptyState icon={Bell} title="Sin alertas activas" description="Todo está al día. ¡Buen trabajo!" />
        ) : (
          Object.entries(grouped).map(([type, items]) => {
            const cfg = typeConfig[type]
            if (!cfg) return null
            return (
              <div key={type}>
                <div className="flex items-center gap-2 mb-2">
                  <cfg.icon size={16} style={{ color: cfg.color }} />
                  <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: cfg.color }}>
                    {cfg.title} ({items.length})
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  {items.map((a, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-[12px]"
                      style={{ background: cfg.bg, border: `1px solid ${cfg.bdr}` }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>{a.name}</p>
                        <p className="text-xs mt-0.5" style={{ color: cfg.color }}>{a.label}</p>
                      </div>
                      {a.phone && (
                        <a
                          href={`https://wa.me/${a.phone.replace(/\D/g, '')}${a.isToday ? `?text=${encodeURIComponent(`¡Feliz cumpleaños ${a.name.split(' ')[0]}! 🎉 El grupo te desea un día increíble.`)}` : ''}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 px-3 py-1.5 rounded-[8px] text-xs font-bold flex-shrink-0 press"
                          style={{ background: 'var(--green-bg)', color: 'var(--green)', border: '1px solid var(--green-bdr)' }}>
                          <WhatsappLogo size={14} />
                          WA
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
