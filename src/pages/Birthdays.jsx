import { useState, useEffect, useMemo } from 'react'
import { usePersistedState } from '../hooks/usePersistedState'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import { Cake, WhatsappLogo } from '@phosphor-icons/react'
import { isBirthdayToday, formatBirthday, daysUntilBirthday, ageFrom } from '../utils/dates'
import { memberInAnyGroup, memberInGroup } from '../utils/members'

export default function Birthdays() {
  const { profile } = useAuth()
  const navigate    = useNavigate()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'

  const [members, setMembers] = useState([])
  const [groups,  setGroups]  = useState([])
  const [loading, setLoading] = useState(true)
  const [selGroup, setSelGroup] = usePersistedState('bday_group', '')

  useEffect(() => { loadData() }, [profile])

  async function loadData() {
    setLoading(true)
    try {
      const [mSnap, gSnap] = await Promise.all([
        getDocs(collection(db, 'members')),
        getDocs(collection(db, 'groups')),
      ])
      let mems = mSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(m => m.active !== false && m.birthDate)
      if (!isAdmin) {
        const gids = profile?.groupIds || []
        mems = mems.filter(m => memberInAnyGroup(m, gids))
      }
      setMembers(mems)
      const allGrps = gSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      setGroups(isAdmin ? allGrps : allGrps.filter(g => (profile?.groupIds || []).includes(g.id)))
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const sorted = useMemo(() => {
    let mems = selGroup ? members.filter(m => memberInGroup(m, selGroup)) : members
    return mems
      .map(m => ({
        ...m,
        _days:  daysUntilBirthday(m.birthDate),
        _age:   ageFrom(m.birthDate),
        _today: isBirthdayToday(m.birthDate),
      }))
      .sort((a, b) => (a._days ?? 999) - (b._days ?? 999))
  }, [members, selGroup])

  // Group by month
  const byMonth = useMemo(() => {
    const map = {}
    sorted.forEach(m => {
      const mm = m.birthDate.slice(5, 7)
      if (!map[mm]) map[mm] = []
      map[mm].push(m)
    })
    return Object.entries(map).sort(([a], [b]) => {
      // Sort starting from current month
      const cur = new Date().getMonth() + 1
      const na = ((parseInt(a) - cur + 12) % 12)
      const nb = ((parseInt(b) - cur + 12) % 12)
      return na - nb
    })
  }, [sorted])

  const monthName = (mm) => {
    const d = new Date(2000, parseInt(mm) - 1, 1)
    return d.toLocaleDateString('es-ES', { month: 'long' }).charAt(0).toUpperCase() +
      d.toLocaleDateString('es-ES', { month: 'long' }).slice(1)
  }

  const todayMembers = sorted.filter(m => m._today)

  return (
    <div className="flex flex-col" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <div>
          <h1 className="font-syne font-extrabold text-[17px]" style={{ color: 'var(--text)' }}>Cumpleaños</h1>
          {!loading && sorted.length > 0 && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>{sorted.length} persona{sorted.length !== 1 ? 's' : ''} en la lista</p>
          )}
        </div>
        {todayMembers.length > 0 && (
          <span className="text-xs font-bold px-2.5 py-1 rounded-full"
            style={{ background: 'var(--amber-bg)', color: 'var(--amber)', border: '1px solid var(--amber-bdr)' }}>
            🎂 {todayMembers.length} hoy
          </span>
        )}
      </div>

      {/* Group filter */}
      {(isAdmin || groups.length > 1) && (
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <select value={selGroup} onChange={e => setSelGroup(e.target.value)}
            className="w-full rounded-[10px] px-3 py-2.5 text-sm font-medium outline-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit' }}>
            <option value="">Todos los grupos</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
      )}

      <div className="px-4 py-4 flex flex-col gap-5">
        {loading ? <LoadingSpinner /> : sorted.length === 0 ? (
          <EmptyState icon={Cake} title="Sin cumpleaños" description="Los miembros aún no tienen fecha de nacimiento registrada." />
        ) : (
          <>
            {/* Today's birthdays highlight */}
            {todayMembers.length > 0 && (
              <div className="rounded-[14px] p-4"
                style={{ background: 'var(--amber-bg)', border: '2px solid var(--amber-bdr)' }}>
                <p className="text-[11px] font-extrabold uppercase tracking-widest mb-3" style={{ color: 'var(--amber)' }}>
                  🎂 Hoy cumplen años
                </p>
                <div className="flex flex-col gap-2">
                  {todayMembers.map(m => (
                    <div key={m.id} className="flex items-center gap-3">
                      <button onClick={() => navigate(`/members/${m.id}`)} className="flex-1 min-w-0 text-left">
                        <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>{m.fullName?.toUpperCase()}</p>
                        <p className="text-xs" style={{ color: 'var(--amber)' }}>¡Cumple {m._age ? `${m._age} años` : 'años'}!</p>
                      </button>
                      {m.phone && (
                        <a href={`https://wa.me/${m.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`¡Feliz cumpleaños ${m.fullName.split(' ')[0]}! 🎉`)}`}
                          target="_blank" rel="noreferrer"
                          className="flex items-center gap-1 px-3 py-1.5 rounded-[8px] text-xs font-bold press"
                          style={{ background: 'var(--green-bg)', color: 'var(--green)', border: '1px solid var(--green-bdr)' }}>
                          <WhatsappLogo size={14} /> Felicitar
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* By month */}
            {byMonth.map(([mm, mems]) => (
              <div key={mm}>
                <p className="text-[11px] font-extrabold uppercase tracking-widest mb-2" style={{ color: 'var(--text-2)' }}>
                  {monthName(mm)}
                </p>
                <div className="rounded-[var(--r)] overflow-hidden"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  {mems.map((m, i) => (
                    <div key={m.id} className="flex items-center gap-3 px-4 py-3"
                      style={{ borderBottom: i < mems.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      {/* Day indicator */}
                      <div className="w-10 h-10 rounded-[10px] flex flex-col items-center justify-center flex-shrink-0"
                        style={{ background: m._today ? 'var(--amber-bg)' : 'var(--card)', border: `1px solid ${m._today ? 'var(--amber-bdr)' : 'var(--border)'}` }}>
                        <span className="font-syne font-extrabold text-base leading-none"
                          style={{ color: m._today ? 'var(--amber)' : 'var(--text)' }}>
                          {m.birthDate.slice(8, 10)}
                        </span>
                      </div>
                      <button onClick={() => navigate(`/members/${m.id}`)} className="flex-1 min-w-0 text-left">
                        <p className="text-sm font-bold truncate" style={{ color: 'var(--text)' }}>{m.fullName?.toUpperCase()}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>
                          {formatBirthday(m.birthDate)}
                          {m._age !== null && ` · ${m._age} años`}
                          {m._today
                            ? <span style={{ color: 'var(--amber)', fontWeight: 700 }}> · ¡Hoy!</span>
                            : m._days === 1
                              ? <span style={{ color: 'var(--accent)' }}> · mañana</span>
                              : m._days <= 7
                                ? <span style={{ color: 'var(--accent)' }}> · en {m._days} días</span>
                                : null
                          }
                        </p>
                      </button>
                      {m.phone && (
                        <a href={`https://wa.me/${m.phone.replace(/\D/g, '')}${m._today ? `?text=${encodeURIComponent(`¡Feliz cumpleaños ${m.fullName.split(' ')[0]}! 🎉`)}` : ''}`}
                          target="_blank" rel="noreferrer"
                          className="w-9 h-9 flex items-center justify-center rounded-[9px] press"
                          style={{ background: 'var(--green-bg)', color: 'var(--green)', border: '1px solid var(--green-bdr)', flexShrink: 0 }}>
                          <WhatsappLogo size={18} />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
