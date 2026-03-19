import { useState, useEffect, useMemo } from 'react'
import { usePersistedState } from '../hooks/usePersistedState'
import { collection, getDocs, doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import { Warning, WhatsappLogo } from '@phosphor-icons/react'
import { formatDate } from '../utils/dates'
import { memberInAnyGroup, memberInGroup, getMemberGroupIds } from '../utils/members'

export default function Absences() {
  const { profile } = useAuth()
  const navigate    = useNavigate()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'

  const [absentList, setAbsentList] = useState([])
  const [groups,     setGroups]     = useState([])
  const [loading,    setLoading]    = useState(true)
  const [selGroup,   setSelGroup]   = usePersistedState('abs_group', '')
  const [threshold,  setThreshold]  = useState(2)

  useEffect(() => { loadData() }, [profile])

  async function loadData() {
    setLoading(true)
    try {
      const cfgSnap = await getDoc(doc(db, 'config', 'general'))
      const cfg = cfgSnap.exists() ? cfgSnap.data() : {}
      const absenceWeeks = cfg.absenceAlertWeeks || 2
      setThreshold(absenceWeeks)

      const [mSnap, aSnap, gSnap] = await Promise.all([
        getDocs(collection(db, 'members')),
        getDocs(collection(db, 'attendance')),
        getDocs(collection(db, 'groups')),
      ])

      let members = mSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(m => m.active !== false)
      if (!isAdmin) {
        const gids = profile?.groupIds || []
        members = members.filter(m => memberInAnyGroup(m, gids))
      }

      let allAttDocs = aSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      if (!isAdmin) {
        const gids = profile?.groupIds || []
        allAttDocs = allAttDocs.filter(d => gids.includes(d.groupId))
      }
      allAttDocs.sort((a, b) => (b.date || '').localeCompare(a.date || ''))

      const allGrps = gSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      setGroups(isAdmin ? allGrps : allGrps.filter(g => (profile?.groupIds || []).includes(g.id)))

      // Only look at meetings where the member has an explicit record (avoids joinDate false negatives)
      const result = []
      members.forEach(m => {
        const memberGroups = getMemberGroupIds(m)

        // Filter to this member's group(s)
        const groupDocs = allAttDocs.filter(r => {
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

        if (!consecutive) return

        // Calculate full streak count and last attended date for display
        let streak = 0
        let lastPresent = null
        for (const rec of memberDocs) {
          const st = rec.records?.[m.id]
          if (st === 'present' || st === 'late') {
            lastPresent = rec.date
            break
          }
          streak++
        }

        result.push({ member: m, streak, lastPresent })
      })

      result.sort((a, b) => b.streak - a.streak || (a.member.fullName || '').localeCompare(b.member.fullName || '', 'es'))
      setAbsentList(result)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const filtered = useMemo(() => {
    if (!selGroup) return absentList
    return absentList.filter(({ member }) => memberInGroup(member, selGroup))
  }, [absentList, selGroup])

  return (
    <div className="flex flex-col" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <h1 className="font-syne font-extrabold text-[17px]" style={{ color: 'var(--text)' }}>Inasistencias</h1>
        {filtered.length > 0 && (
          <span className="w-6 h-6 rounded-full text-[11px] font-extrabold flex items-center justify-center"
            style={{ background: 'var(--red)', color: 'white' }}>{filtered.length}</span>
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

      <div className="px-4 py-4 flex flex-col gap-3">
        {loading ? <LoadingSpinner /> : filtered.length === 0 ? (
          <EmptyState
            icon={Warning}
            title="Sin inasistencias"
            description={`Ningún miembro lleva ${threshold} o más reuniones consecutivas sin asistir.`}
          />
        ) : (
          <>
            <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-2)' }}>
              {filtered.length} miembro{filtered.length !== 1 ? 's' : ''} con {threshold}+ ausencias seguidas
            </p>
            <div className="rounded-[var(--r)] overflow-hidden"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              {filtered.map(({ member: m, streak, lastPresent }, i) => (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3"
                  style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none' }}>

                  {/* Streak badge */}
                  <div className="w-10 h-10 rounded-[10px] flex flex-col items-center justify-center flex-shrink-0"
                    style={{ background: 'var(--red-bg)', border: '1px solid var(--red-bdr)' }}>
                    <span className="font-syne font-extrabold text-base leading-none" style={{ color: 'var(--red)' }}>
                      {streak}
                    </span>
                  </div>

                  {/* Info — tappable to go to profile */}
                  <button onClick={() => navigate(`/members/${m.id}`)} className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-bold truncate" style={{ color: 'var(--text)' }}>{m.fullName?.toUpperCase()}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--red)' }}>
                      {streak === 1 ? 'Última reunión ausente' : `${streak} reuniones seguidas sin asistir`}
                    </p>
                    {lastPresent ? (
                      <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-3)' }}>
                        Última vez: {formatDate(lastPresent, { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    ) : (
                      <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-3)' }}>Sin asistencias registradas</p>
                    )}
                  </button>

                  {/* WhatsApp */}
                  {m.phone && (
                    <a href={`https://wa.me/${m.phone.replace(/\D/g, '')}`}
                      target="_blank" rel="noreferrer"
                      className="w-9 h-9 flex items-center justify-center rounded-[9px] press"
                      style={{ background: 'var(--green-bg)', color: 'var(--green)', border: '1px solid var(--green-bdr)', flexShrink: 0 }}>
                      <WhatsappLogo size={18} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
