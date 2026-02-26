import { useState, useEffect, useMemo } from 'react'
import { usePersistedState } from '../hooks/usePersistedState'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import TopBar from '../components/layout/TopBar'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { CalendarBlank } from '@phosphor-icons/react'
import { formatDateShort, todayStr, localDateStr } from '../utils/dates'
import { memberInAnyGroup, memberInGroup } from '../utils/members'

export default function History() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'

  const [records,  setRecords]  = useState([])
  const [members,  setMembers]  = useState([])
  const [groups,   setGroups]   = useState([])
  const [loading,  setLoading]  = useState(true)
  const [selGroup, setSelGroup] = usePersistedState('hist_group', '')
  const [dateFrom, setDateFrom] = useState(localDateStr(new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)))
  const [dateTo,   setDateTo]   = useState(todayStr())

  useEffect(() => { loadData() }, [profile])

  async function loadData() {
    setLoading(true)
    try {
      const [aSnap, mSnap, gSnap] = await Promise.all([
        getDocs(collection(db, 'attendance')),
        getDocs(collection(db, 'members')),
        getDocs(collection(db, 'groups')),
      ])
      let recs = aSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      let mems = mSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      const grps = gSnap.docs.map(d => ({ id: d.id, ...d.data() }))

      if (!isAdmin) {
        const gids = profile?.groupIds || []
        recs = recs.filter(r => gids.includes(r.groupId))
        mems = mems.filter(m => memberInAnyGroup(m, gids))
        setGroups(grps.filter(g => gids.includes(g.id)))
      } else {
        setGroups(grps)
      }

      recs.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      setRecords(recs)
      setMembers(mems)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const filtered = useMemo(() => {
    return records.filter(r => {
      const inGroup = !selGroup || r.groupId === selGroup
      const inDate  = (!dateFrom || r.date >= dateFrom) && (!dateTo || r.date <= dateTo)
      return inGroup && inDate
    })
  }, [records, selGroup, dateFrom, dateTo])

  // Get members for selected group
  const groupMembers = useMemo(() => {
    if (!selGroup) return members
    return members.filter(m => memberInGroup(m, selGroup))
  }, [members, selGroup])

  // Chart data (last 8 records)
  const chartData = useMemo(() => {
    return filtered.slice(0, 8).reverse().map(r => {
      const recordedIds = Object.keys(r.records || {})
      const eligibleRecorded = recordedIds.filter(id => {
        const m = groupMembers.find(mm => mm.id === id)
        return !m?.joinDate || m.joinDate <= r.date
      })
      const total   = eligibleRecorded.length || groupMembers.filter(m => !m.joinDate || m.joinDate <= r.date).length
      const present = Object.values(r.records || {}).filter(v => v === 'present').length
      const pct     = total > 0 ? Math.round((present / total) * 100) : 0
      const d = new Date((r.date || '') + 'T12:00:00')
      return {
        date: d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
        pct,
        present,
        total,
      }
    })
  }, [filtered, groupMembers])

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div className="px-3 py-2 rounded-[10px] text-xs font-semibold"
        style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text)' }}>
        <p>{label}</p>
        <p style={{ color: 'var(--accent)' }}>{payload[0]?.value}% asistencia</p>
        <p style={{ color: 'var(--text-2)' }}>{payload[0]?.payload.present}/{payload[0]?.payload.total} presentes</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <h1 className="font-syne font-extrabold text-[17px]" style={{ color: 'var(--text)' }}>Historial</h1>
      </div>

      {/* Filters */}
      <div className="px-4 py-3 flex flex-col gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
        {(isAdmin || groups.length > 1) && (
          <select value={selGroup} onChange={e => setSelGroup(e.target.value)}
            className="w-full rounded-[10px] px-3 py-2.5 text-sm font-medium outline-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit' }}>
            <option value="">Todos los grupos</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}
        <div className="flex gap-2">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="flex-1 rounded-[10px] px-3 py-2.5 text-sm font-medium outline-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit', colorScheme: 'dark' }} />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="flex-1 rounded-[10px] px-3 py-2.5 text-sm font-medium outline-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit', colorScheme: 'dark' }} />
        </div>
      </div>

      <div className="px-4 py-4 flex flex-col gap-4">
        {loading ? <LoadingSpinner /> : (
          <>
            {/* Chart */}
            {chartData.length > 0 && (
              <div className="rounded-[var(--r)] p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <p className="text-[11px] font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--text-2)' }}>
                  Últimas {chartData.length} reuniones
                </p>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={chartData} barSize={24}>
                    <XAxis dataKey="date" tick={{ fill: '#8896b0', fontSize: 10, fontFamily: 'inherit' }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fill: '#8896b0', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
                      {chartData.map((d, i) => (
                        <Cell key={i} fill={d.pct >= 70 ? '#22c55e' : d.pct >= 40 ? '#f59e0b' : '#ef4444'} fillOpacity={0.85} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Records list */}
            {filtered.length === 0 ? (
              <EmptyState icon={CalendarBlank} title="Sin registros" description="No hay asistencias en el rango seleccionado." />
            ) : (
              <>
                <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-2)' }}>
                  {filtered.length} registro{filtered.length !== 1 ? 's' : ''}
                </p>
                {filtered.map(r => {
                  const recordedIds = Object.keys(r.records || {})
                  const eligibleRecorded = recordedIds.filter(id => {
                    const m = groupMembers.find(mm => mm.id === id)
                    return !m?.joinDate || m.joinDate <= r.date
                  })
                  const total   = eligibleRecorded.length || groupMembers.filter(m => !m.joinDate || m.joinDate <= r.date).length
                  const present = Object.values(r.records || {}).filter(v => v === 'present').length
                  const late    = Object.values(r.records || {}).filter(v => v === 'late').length
                  const pct     = total > 0 ? Math.round(((present + late) / total) * 100) : 0
                  const color   = pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--amber)' : 'var(--red)'
                  const grp     = groups.find(g => g.id === r.groupId)
                  return (
                    <div key={r.id} className="flex items-center gap-4 px-4 py-3 rounded-[12px]"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>{formatDateShort(r.date)}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>
                          {present + late} de {total} asistieron
                          {grp && <span style={{ color: 'var(--text-3)' }}> · {grp.name}</span>}
                        </p>
                      </div>
                      <span className="font-syne font-extrabold text-xl" style={{ color }}>{pct}%</span>
                    </div>
                  )
                })}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
