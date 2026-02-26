import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, getDocs, doc, getDoc, query, where, orderBy, limit } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import {
  Users, CalendarCheck, ClipboardText, Bell, ChartBar,
  Handshake, Cross, ArrowRight, Cake, Warning,
  UserCircleMinus
} from '@phosphor-icons/react'
import { todayStr, formatDate, isBirthdaySoon, isBirthdayToday, localDateStr } from '../utils/dates'

function StatTile({ icon: Icon, value, label, color = 'blue', to }) {
  const navigate = useNavigate()
  const colors = {
    blue:  { bg: 'rgba(59,130,246,0.12)', color: 'var(--accent)' },
    green: { bg: 'var(--green-bg)',        color: 'var(--green)' },
    red:   { bg: 'var(--red-bg)',          color: 'var(--red)' },
    amber: { bg: 'var(--amber-bg)',        color: 'var(--amber)' },
  }
  const c = colors[color]
  const inner = (
    <>
      <div className="w-9 h-9 rounded-[10px] flex items-center justify-center" style={{ background: c.bg, color: c.color }}>
        <Icon size={20} />
      </div>
      <div>
        <div className="font-syne font-extrabold text-3xl" style={{ color: 'var(--text)' }}>{value}</div>
        <div className="text-xs font-semibold mt-0.5" style={{ color: 'var(--text-2)' }}>{label}</div>
      </div>
    </>
  )
  if (to) {
    return (
      <button onClick={() => navigate(to)}
        className="flex flex-col gap-3 p-4 rounded-[var(--r)] text-left press"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {inner}
      </button>
    )
  }
  return (
    <div className="flex flex-col gap-3 p-4 rounded-[var(--r)]" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      {inner}
    </div>
  )
}

function QuickAction({ icon: Icon, label, to }) {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate(to)}
      className="flex items-center gap-3 p-4 rounded-[var(--r)] w-full text-left press"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div className="w-10 h-10 rounded-[11px] flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(59,130,246,0.12)', color: 'var(--accent)' }}>
        <Icon size={20} />
      </div>
      <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--text)' }}>{label}</span>
      <ArrowRight size={16} style={{ color: 'var(--text-3)' }} />
    </button>
  )
}

export default function Dashboard() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [loading,    setLoading]    = useState(true)
  const [stats,      setStats]      = useState({ totalMembers: 0, totalSessions: 0, lastPresent: 0, lastTotal: 0 })
  const [recentRecs, setRecentRecs] = useState([])
  const [alerts,     setAlerts]     = useState([])
  const [config,     setConfig]     = useState({})

  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'
  const today = new Date()
  const dateLabel = today.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  useEffect(() => {
    loadDashboard()
  }, [profile])

  async function loadDashboard() {
    setLoading(true)
    try {
      // Load config
      const cfgSnap = await getDoc(doc(db, 'config', 'general'))
      const cfg = cfgSnap.exists() ? cfgSnap.data() : {}
      setConfig(cfg)

      // Determine which groups to query
      const userGroupIds = isAdmin ? null : (profile?.groupIds || [])

      // Members
      let membersQ = query(collection(db, 'members'), where('active', '==', true))
      const membersSnap = await getDocs(membersQ)
      const allMembers = membersSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      const members = userGroupIds ? allMembers.filter(m => userGroupIds.includes(m.groupId)) : allMembers

      // Recent attendance (all docs, filter by groupId in JS to avoid compound index)
      const attSnap = await getDocs(collection(db, 'attendance'))
      let attDocs = attSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      if (userGroupIds) {
        attDocs = attDocs.filter(d => userGroupIds.includes(d.groupId))
      }
      attDocs.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      const recent = attDocs.slice(0, 8)
      setRecentRecs(recent)

      const last = recent[0]
      const lastPresent = last ? Object.values(last.records || {}).filter(v => v === 'present').length : 0
      const lastTotal   = last ? members.length : 0

      setStats({ totalMembers: members.length, totalSessions: attDocs.length, lastPresent, lastTotal })

      // Alerts
      const alertList = []
      const absenceWeeks = cfg.absenceAlertWeeks || 2

      // Birthday alerts
      members.forEach(m => {
        if (isBirthdaySoon(m.birthDate, 7)) {
          alertList.push({
            type: 'birthday',
            label: isBirthdayToday(m.birthDate) ? `¡Hoy cumple años ${m.shortName || m.fullName.split(' ')[0]}!` : `Cumpleaños próximo: ${m.shortName || m.fullName.split(' ')[0]}`,
            phone: m.phone,
            name: m.fullName,
          })
        }
      })

      // Absence alerts
      if (attDocs.length >= absenceWeeks) {
        const lastNDates = attDocs.slice(0, absenceWeeks).map(d => d.date)
        members.forEach(m => {
          const consecutiveAbsent = lastNDates.every(date => {
            const rec = attDocs.find(d => d.date === date)
            if (!rec) return true
            const status = rec.records?.[m.id]
            return !status || status === 'absent'
          })
          if (consecutiveAbsent && lastNDates.length >= absenceWeeks) {
            alertList.push({
              type: 'absence',
              label: `${m.shortName || m.fullName.split(' ')[0]} ausente ${absenceWeeks} semanas seguidas`,
              memberId: m.id,
            })
          }
        })
      }

      // Visitor follow-up alerts
      const visitorsSnap = await getDocs(query(collection(db, 'visitors'), where('status', '!=', 'converted')))
      const visitors = visitorsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      const sevenStr = localDateStr(sevenDaysAgo)
      visitors.forEach(v => {
        const notes = v.notes || []
        const lastNote = notes.length > 0 ? notes[notes.length - 1] : null
        if (!lastNote || lastNote.date < sevenStr) {
          alertList.push({ type: 'visitor', label: `Visitante sin seguimiento: ${v.name}`, visitorId: v.id })
        }
      })

      setAlerts(alertList.slice(0, 10))
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <LoadingSpinner fullScreen />

  const lastPct = stats.lastTotal > 0 ? Math.round((stats.lastPresent / stats.lastTotal) * 100) : 0
  const pctColor = lastPct >= 70 ? 'var(--green)' : lastPct >= 40 ? 'var(--amber)' : 'var(--red)'

  return (
    <div className="flex flex-col" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      {/* Hero header */}
      <div className="relative overflow-hidden px-6 pb-6" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', paddingTop: 'max(52px, env(safe-area-inset-top))' }}>
        <div className="absolute top-0 right-0 w-64 h-64 pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)' }} />
        <div className="flex items-center gap-1.5 mb-2">
          <Cross size={13} style={{ color: 'var(--accent)' }} />
          <span className="text-[11px] font-bold uppercase tracking-[1.8px]" style={{ color: 'var(--accent)' }}>
            {config.churchName || 'Grupo Juvenil'}
          </span>
        </div>
        <h1 className="font-syne font-extrabold text-[28px] leading-tight mb-1" style={{ color: 'var(--text)' }}>
          Control de<br />Asistencia
        </h1>
        <p className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>
          {dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}
        </p>
      </div>

      <div className="flex flex-col gap-4 px-4 py-4">

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          <StatTile icon={Users}        value={stats.totalMembers}  label="Miembros"  color="blue"  to="/members" />
          <StatTile icon={CalendarCheck} value={stats.totalSessions} label="Reuniones" color="green" to="/meetings" />
        </div>

        {/* Last service summary */}
        {stats.totalSessions > 0 && (
          <div className="flex items-center gap-4 p-4 rounded-[var(--r)]" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-2)' }}>Último culto</p>
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                {stats.lastPresent} de {stats.lastTotal} presentes
              </p>
            </div>
            <div className="font-syne font-extrabold text-4xl" style={{ color: pctColor }}>{lastPct}%</div>
          </div>
        )}

        {/* Attendance CTA */}
        <button
          onClick={() => navigate('/attendance')}
          className="flex items-center justify-center gap-2 h-14 rounded-[var(--r)] font-bold text-[15px] press"
          style={{ background: 'var(--accent-g)', color: 'white', boxShadow: '0 4px 20px rgba(59,130,246,0.28)' }}
        >
          <ClipboardText size={20} />
          Pasar asistencia hoy
        </button>

        {/* Alerts summary */}
        {alerts.length > 0 && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-2)' }}>
              Alertas activas
            </p>
            <div className="flex flex-col gap-2">
              {alerts.slice(0, 3).map((a, i) => {
                const Icon = a.type === 'birthday' ? Cake : a.type === 'absence' ? Warning : Handshake
                const color = a.type === 'birthday' ? 'var(--amber)' : a.type === 'absence' ? 'var(--red)' : 'var(--accent)'
                const bg    = a.type === 'birthday' ? 'var(--amber-bg)' : a.type === 'absence' ? 'var(--red-bg)' : 'rgba(59,130,246,0.08)'
                return (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-[12px]"
                    style={{ background: bg, border: `1px solid ${color}33` }}>
                    <Icon size={16} style={{ color, flexShrink: 0 }} />
                    <span className="text-xs font-semibold flex-1" style={{ color }}>{a.label}</span>
                    {a.type === 'birthday' && a.phone && (
                      <a href={`https://wa.me/${a.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                        className="text-xs font-bold px-2 py-1 rounded-[6px]"
                        style={{ background: 'var(--green-bg)', color: 'var(--green)', border: '1px solid var(--green-bdr)' }}>
                        WhatsApp
                      </a>
                    )}
                  </div>
                )
              })}
              {alerts.length > 3 && (
                <button onClick={() => navigate('/alerts')} className="text-xs font-semibold text-center py-2 press" style={{ color: 'var(--accent)' }}>
                  Ver todas las alertas ({alerts.length})
                </button>
              )}
            </div>
          </div>
        )}

        {/* Recent sessions */}
        {recentRecs.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-2)' }}>Últimas reuniones</p>
              <button onClick={() => navigate('/meetings')} className="text-[11px] font-bold press" style={{ color: 'var(--accent)' }}>
                Ver todas
              </button>
            </div>
            <div className="rounded-[var(--r)] overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              {recentRecs.slice(0, 5).map((r, i) => {
                const total   = stats.totalMembers
                const present = Object.values(r.records || {}).filter(v => v === 'present').length
                const pct     = total > 0 ? Math.round((present / total) * 100) : 0
                const color   = pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--amber)' : 'var(--red)'
                const d       = r.date ? new Date(r.date + 'T12:00:00') : new Date()
                const lbl     = d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
                return (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-3"
                    style={{ borderBottom: i < recentRecs.length - 1 && i < 4 ? '1px solid var(--border)' : 'none' }}>
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold" style={{ color: 'var(--text)' }}>
                        {lbl.charAt(0).toUpperCase() + lbl.slice(1)}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>
                        {present} de {total} presentes
                      </div>
                    </div>
                    <span className="font-syne font-extrabold text-lg" style={{ color }}>{pct}%</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Quick actions */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-2)' }}>Accesos rápidos</p>
          <div className="flex flex-col gap-2">
            <QuickAction icon={Users}        label="Personas"   to="/members" />
            <QuickAction icon={CalendarCheck} label="Reuniones" to="/meetings" />
            <QuickAction icon={ChartBar}     label="Historial"  to="/history" />
            {(isAdmin || profile?.role === 'leader') && <QuickAction icon={ChartBar} label="Reportes" to="/reports" />}
          </div>
        </div>
      </div>
    </div>
  )
}
