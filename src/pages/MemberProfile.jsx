import { useState, useEffect } from 'react'
import { doc, getDoc, collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import TopBar from '../components/layout/TopBar'
import Avatar from '../components/ui/Avatar'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { PencilSimple, Phone, MapPin, Calendar, CheckCircle, XCircle, Clock, MinusCircle, Handshake } from '@phosphor-icons/react'
import { formatDate, ageFrom } from '../utils/dates'

const SPIRITUAL_LABEL = { new: 'Nuevo', following: 'En seguimiento', consolidated: 'Consolidado', member: 'Miembro', leader: 'Líder' }
const SPIRITUAL_COLOR = { new: 'var(--amber)', following: 'var(--accent)', consolidated: 'var(--green)', member: '#10b981', leader: '#a78bfa' }

export default function MemberProfile() {
  const { id }  = useParams()
  const { profile } = useAuth()
  const navigate    = useNavigate()
  const isAdmin     = profile?.role === 'admin' || profile?.role === 'super_admin'

  const [member,  setMember]  = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [groups,  setGroups]  = useState([])

  useEffect(() => { loadData() }, [id])

  async function loadData() {
    setLoading(true)
    try {
      const snap = await getDoc(doc(db, 'members', id))
      if (!snap.exists()) { navigate(-1); return }
      const m = { id: snap.id, ...snap.data() }
      setMember(m)

      const groupIds = m.groupIds?.length > 0 ? m.groupIds : (m.groupId ? [m.groupId] : [])
      if (groupIds.length > 0) {
        const gSnaps = await Promise.all(groupIds.map(gid => getDoc(doc(db, 'groups', gid))))
        setGroups(gSnaps.filter(s => s.exists()).map(s => ({ id: s.id, ...s.data() })))
      }

      // Attendance history for this member
      const attSnap = await getDocs(collection(db, 'attendance'))
      const hist = []
      attSnap.docs.forEach(d => {
        const data = d.data()
        const status = data.records?.[id]
        if (status !== undefined) {
          hist.push({ date: data.date, status, groupId: data.groupId })
        }
      })
      hist.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      setHistory(hist.slice(0, 20))
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  if (loading) return (
    <div style={{ background: 'var(--bg)' }}>
      <TopBar title="Perfil" />
      <LoadingSpinner />
    </div>
  )
  if (!member) return null

  const present = history.filter(h => h.status === 'present').length
  const late    = history.filter(h => h.status === 'late').length
  const pct     = history.length > 0 ? Math.round(((present + late) / history.length) * 100) : 0
  const pctColor = pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--amber)' : 'var(--red)'
  const statusIcon = { present: CheckCircle, absent: XCircle, late: Clock }
  const statusColor = { present: 'var(--green)', absent: 'var(--red)', late: 'var(--amber)' }

  return (
    <div className="flex flex-col" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      <TopBar
        title={member.fullName}
        actions={
          <button onClick={() => navigate(`/members/${id}/edit`)}
            className="w-9 h-9 flex items-center justify-center rounded-[10px] press"
            style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
            <PencilSimple size={18} />
          </button>
        }
      />

      <div className="px-4 py-6 flex flex-col items-center gap-2 text-center"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <Avatar name={member.fullName} size={72} />
        <h2 className="font-syne font-extrabold text-xl mt-2" style={{ color: 'var(--text)' }}>{member.fullName}</h2>
        {member.shortName && <p className="text-sm" style={{ color: 'var(--text-2)' }}>{member.shortName}</p>}
        <div className="flex items-center gap-2 flex-wrap justify-center">
          {member.spiritualStatus && (
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full"
              style={{ background: SPIRITUAL_COLOR[member.spiritualStatus] + '20', color: SPIRITUAL_COLOR[member.spiritualStatus] }}>
              {SPIRITUAL_LABEL[member.spiritualStatus]}
            </span>
          )}
          {groups.map(g => (
            <span key={g.id} className="text-[11px]" style={{ color: 'var(--text-3)' }}>{g.name}</span>
          ))}
          {member.active === false && (
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}>Inactivo</span>
          )}
        </div>
      </div>

      <div className="px-4 py-4 flex flex-col gap-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Asistencias', value: present + late, color: 'var(--green)' },
            { label: 'Ausencias',   value: history.length - present - late, color: 'var(--red)' },
            { label: '% Asist.',    value: `${pct}%`, color: pctColor },
          ].map(s => (
            <div key={s.label} className="flex flex-col items-center gap-1 p-3 rounded-[12px]"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <span className="font-syne font-extrabold text-2xl" style={{ color: s.color }}>{s.value}</span>
              <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-2)' }}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* Info */}
        <div className="rounded-[var(--r)] overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {[
            member.phone      && { icon: Phone,     label: 'WhatsApp',         value: member.phone,                  href: `https://wa.me/${member.phone.replace(/\D/g,'')}` },
            member.address    && { icon: MapPin,    label: 'Dirección',        value: member.address },
            member.birthDate  && { icon: Calendar,  label: 'Cumpleaños',       value: `${formatDate(member.birthDate, { day: 'numeric', month: 'long' })} (${ageFrom(member.birthDate)} años)` },
            member.joinDate   && { icon: Calendar,  label: 'Fecha de ingreso', value: formatDate(member.joinDate, { day: 'numeric', month: 'long', year: 'numeric' }) },
            member.referredBy && { icon: Handshake, label: 'Invitado por',     value: member.referredBy },
          ].filter(Boolean).map((item, i, arr) => (
            <div key={item.label} className="flex items-center gap-3 px-4 py-3"
              style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <item.icon size={18} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>{item.label}</p>
                {item.href
                  ? <a href={item.href} target="_blank" rel="noreferrer" className="text-sm font-semibold truncate block" style={{ color: 'var(--accent)' }}>{item.value}</a>
                  : <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{item.value}</p>
                }
              </div>
            </div>
          ))}
        </div>

        {/* Attendance history */}
        {history.length > 0 && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-2)' }}>
              Historial de asistencia
            </p>
            <div className="rounded-[var(--r)] overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              {history.map((h, i) => {
                const Icon = statusIcon[h.status] || MinusCircle
                const color = statusColor[h.status] || 'var(--text-3)'
                const d = new Date(h.date + 'T12:00:00')
                const label = d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
                return (
                  <div key={h.date} className="flex items-center gap-3 px-4 py-3"
                    style={{ borderBottom: i < history.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <Icon size={18} style={{ color, flexShrink: 0 }} />
                    <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--text)' }}>
                      {label.charAt(0).toUpperCase() + label.slice(1)}
                    </span>
                    <span className="text-xs font-bold" style={{ color }}>
                      {{ present: 'Presente', absent: 'Ausente', late: 'Tardanza' }[h.status] || h.status}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
