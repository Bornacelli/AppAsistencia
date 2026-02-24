import { useState, useEffect } from 'react'
import { collection, getDocs, doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import { Bell, Cake, Warning, Handshake, WhatsappLogo, X, ArrowRight } from '@phosphor-icons/react'
import { isBirthdaySoon, isBirthdayToday, ageFrom, formatBirthday, localDateStr, todayStr } from '../utils/dates'

const DISMISSED_KEY = 'dismissed_alerts_v2'

function getDismissed() {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY)
    if (!raw) return {}
    return JSON.parse(raw)
  } catch { return {} }
}

function saveDismissed(map) {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify(map))
}

export default function Alerts() {
  const { profile } = useAuth()
  const navigate    = useNavigate()
  const isAdmin = profile?.role === 'admin'

  const [alerts,    setAlerts]    = useState([])
  const [dismissed, setDismissed] = useState(() => getDismissed())
  const [loading,   setLoading]   = useState(true)

  useEffect(() => { loadAlerts() }, [profile])

  function dismissAlert(key) {
    const next = { ...dismissed, [key]: todayStr() }
    setDismissed(next)
    saveDismissed(next)
  }

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
              : `Cumpleaños el ${formatBirthday(m.birthDate)}`,
            name:     m.fullName,
            phone:    m.phone,
            memberId: m.id,
            alertKey: `birthday_${m.id}_${m.birthDate?.slice(5)}`,
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
              alertKey: `absence_${m.id}`,
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
            alertKey:  `visitor_${v.id}`,
          })
        }
      })

      // Sort by priority then name
      alertList.sort((a, b) => a.priority - b.priority || (a.name || '').localeCompare(b.name || '', 'es'))
      setAlerts(alertList)
      // Clean up old dismissals (older than 7 days for non-birthdays, 365 for birthdays)
      const today = todayStr()
      const freshDismissed = {}
      Object.entries(getDismissed()).forEach(([k, date]) => {
        const daysDiff = Math.round((new Date(today) - new Date(date)) / (1000 * 60 * 60 * 24))
        const keep = k.startsWith('birthday_') ? daysDiff < 1 : daysDiff < 7
        if (keep) freshDismissed[k] = date
      })
      saveDismissed(freshDismissed)
      setDismissed(freshDismissed)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const typeConfig = {
    birthday: { icon: Cake,  color: 'var(--amber)', bg: 'var(--amber-bg)', bdr: 'var(--amber-bdr)', title: 'Cumpleaños' },
    absence:  { icon: Warning,    color: 'var(--red)',   bg: 'var(--red-bg)',   bdr: 'var(--red-bdr)',   title: 'Inasistencias' },
    visitor:  { icon: Handshake,  color: 'var(--accent)', bg: 'rgba(59,130,246,0.08)', bdr: 'rgba(59,130,246,0.2)', title: 'Seguimiento visitantes' },
  }

  const visibleAlerts = alerts.filter(a => !dismissed[a.alertKey])

  const grouped = visibleAlerts.reduce((acc, a) => {
    if (!acc[a.type]) acc[a.type] = []
    acc[a.type].push(a)
    return acc
  }, {})

  return (
    <div className="flex flex-col" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <h1 className="font-syne font-extrabold text-[17px]" style={{ color: 'var(--text)' }}>Alertas</h1>
        {visibleAlerts.length > 0 && (
          <span className="w-6 h-6 rounded-full text-[11px] font-extrabold flex items-center justify-center"
            style={{ background: 'var(--red)', color: 'white' }}>{visibleAlerts.length}</span>
        )}
      </div>

      <div className="px-4 py-4 flex flex-col gap-5">
        {loading ? <LoadingSpinner /> : visibleAlerts.length === 0 ? (
          <EmptyState icon={Bell} title="Sin alertas activas" description="Todo está al día. ¡Buen trabajo!" />
        ) : (
          <>
            {/* Birthday shortcut */}
            <button onClick={() => navigate('/birthdays')}
              className="flex items-center gap-3 px-4 py-3 rounded-[12px] press"
              style={{ background: 'var(--amber-bg)', border: '1px solid var(--amber-bdr)' }}>
              <Cake size={18} style={{ color: 'var(--amber)', flexShrink: 0 }} />
              <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--amber)' }}>Ver gestión de cumpleaños</span>
              <ArrowRight size={16} style={{ color: 'var(--amber)' }} />
            </button>

            {Object.entries(grouped).map(([type, items]) => {
              const cfg = typeConfig[type]
              if (!cfg) return null
              return (
                <div key={type}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <cfg.icon size={16} style={{ color: cfg.color }} />
                      <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: cfg.color }}>
                        {cfg.title} ({items.length})
                      </p>
                    </div>
                    <button
                      onClick={() => items.forEach(a => dismissAlert(a.alertKey))}
                      className="text-[10px] font-bold press"
                      style={{ color: 'var(--text-3)' }}>
                      Ignorar todas
                    </button>
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
                        <button
                          onClick={() => dismissAlert(a.alertKey)}
                          className="w-7 h-7 flex items-center justify-center rounded-[7px] flex-shrink-0 press"
                          style={{ background: 'rgba(0,0,0,0.15)', color: cfg.color }}
                          title="Marcar como leída">
                          <X size={12} weight="bold" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
