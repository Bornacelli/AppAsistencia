import { useState, useEffect, useMemo } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import TopBar from '../components/layout/TopBar'
import { DownloadSimple, ChartBar, Users, Trophy, Handshake } from '@phosphor-icons/react'
import { exportAttendanceReport, exportMemberHistory, exportVisitorsReport, exportRankingReport } from '../utils/excel'
import { localDateStr, todayStr, formatDateShort } from '../utils/dates'

export default function Reports() {
  const [records,  setRecords]  = useState([])
  const [members,  setMembers]  = useState([])
  const [visitors, setVisitors] = useState([])
  const [groups,   setGroups]   = useState([])
  const [loading,  setLoading]  = useState(true)
  const [selGroup, setSelGroup] = useState('')
  const [dateFrom, setDateFrom] = useState(localDateStr(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)))
  const [dateTo,   setDateTo]   = useState(todayStr())
  const [activeTab, setActiveTab] = useState('summary')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [aSnap, mSnap, vSnap, gSnap] = await Promise.all([
        getDocs(collection(db, 'attendance')),
        getDocs(collection(db, 'members')),
        getDocs(collection(db, 'visitors')),
        getDocs(collection(db, 'groups')),
      ])
      const recs = aSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      recs.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      setRecords(recs)
      setMembers(mSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setVisitors(vSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setGroups(gSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      const inGroup = !selGroup || r.groupId === selGroup
      const inDate  = (!dateFrom || r.date >= dateFrom) && (!dateTo || r.date <= dateTo)
      return inGroup && inDate
    })
  }, [records, selGroup, dateFrom, dateTo])

  const filteredMembers = useMemo(() => {
    if (!selGroup) return members
    return members.filter(m => m.groupId === selGroup)
  }, [members, selGroup])

  // Ranking report data
  const ranking = useMemo(() => {
    return filteredMembers.map(m => {
      let present = 0, late = 0, total = 0
      filteredRecords.forEach(r => {
        const st = r.records?.[m.id]
        if (st !== undefined) {
          total++
          if (st === 'present') present++
          if (st === 'late') late++
        }
      })
      const pct = total > 0 ? Math.round(((present + late) / total) * 100) : 0
      return { id: m.id, name: m.fullName, total, present, late, pct }
    }).sort((a, b) => b.pct - a.pct)
  }, [filteredMembers, filteredRecords])

  // Summary
  const summary = useMemo(() => {
    if (!filteredRecords.length) return null
    const last = filteredRecords[0]
    const total   = filteredMembers.length
    const present = Object.values(last.records || {}).filter(v => v === 'present').length
    const pct     = total > 0 ? Math.round((present / total) * 100) : 0
    return { date: last.date, total, present, pct }
  }, [filteredRecords, filteredMembers])

  const groupName = groups.find(g => g.id === selGroup)?.name || 'Todos'
  const tabs = [
    { id: 'summary', label: 'Resumen' },
    { id: 'ranking', label: 'Ranking' },
    { id: 'visitors', label: 'Visitantes' },
  ]

  return (
    <div className="flex flex-col" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <h1 className="font-syne font-extrabold text-[17px]" style={{ color: 'var(--text)' }}>Reportes</h1>
      </div>

      {/* Filters */}
      <div className="px-4 py-3 flex flex-col gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <select value={selGroup} onChange={e => setSelGroup(e.target.value)}
          className="w-full rounded-[10px] px-3 py-2.5 text-sm font-medium outline-none"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit' }}>
          <option value="">Todos los grupos</option>
          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <div className="flex gap-2">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="flex-1 rounded-[10px] px-3 py-2.5 text-sm font-medium outline-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit', colorScheme: 'dark' }} />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="flex-1 rounded-[10px] px-3 py-2.5 text-sm font-medium outline-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit', colorScheme: 'dark' }} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex px-4 pt-3 gap-2">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className="px-4 py-1.5 rounded-full text-xs font-bold press"
            style={{ background: activeTab === t.id ? 'rgba(59,130,246,0.15)' : 'var(--surface)', color: activeTab === t.id ? 'var(--accent)' : 'var(--text-2)', border: `1px solid ${activeTab === t.id ? 'rgba(59,130,246,0.3)' : 'var(--border)'}` }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-4 py-4 flex flex-col gap-4">
        {loading ? <LoadingSpinner /> : (
          <>
            {/* Summary tab */}
            {activeTab === 'summary' && (
              <div className="flex flex-col gap-4">
                {summary ? (
                  <>
                    <div className="flex flex-col gap-3">
                      <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-2)' }}>
                        Último culto — {formatDateShort(summary.date)}
                      </p>
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { label: 'Miembros', value: summary.total, color: 'var(--accent)' },
                          { label: 'Presentes', value: summary.present, color: 'var(--green)' },
                          { label: 'Asistencia', value: `${summary.pct}%`, color: summary.pct >= 70 ? 'var(--green)' : summary.pct >= 40 ? 'var(--amber)' : 'var(--red)' },
                        ].map(s => (
                          <div key={s.label} className="flex flex-col items-center gap-1 p-3 rounded-[12px]"
                            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                            <span className="font-syne font-extrabold text-2xl" style={{ color: s.color }}>{s.value}</span>
                            <span className="text-[10px] font-bold uppercase tracking-wide text-center" style={{ color: 'var(--text-2)' }}>{s.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-2)' }}>
                      Período: {filteredRecords.length} reuniones
                    </p>

                    {filteredRecords.slice(0, 10).map(r => {
                      const total   = filteredMembers.length
                      const present = Object.values(r.records || {}).filter(v => v === 'present').length
                      const late    = Object.values(r.records || {}).filter(v => v === 'late').length
                      const pct     = total > 0 ? Math.round(((present + late) / total) * 100) : 0
                      const color   = pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--amber)' : 'var(--red)'
                      return (
                        <div key={r.id} className="flex items-center gap-3 px-4 py-3 rounded-[12px]"
                          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                          <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                          <div className="flex-1">
                            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{formatDateShort(r.date)}</p>
                            <p className="text-xs" style={{ color: 'var(--text-2)' }}>{present + late} de {total}</p>
                          </div>
                          <span className="font-syne font-extrabold text-lg" style={{ color }}>{pct}%</span>
                        </div>
                      )
                    })}

                    <button
                      onClick={() => exportAttendanceReport(filteredRecords, filteredMembers, groupName, `${dateFrom}_${dateTo}`)}
                      className="h-12 rounded-[12px] font-bold text-sm flex items-center justify-center gap-2 press"
                      style={{ background: 'rgba(59,130,246,0.12)', color: 'var(--accent)', border: '1px solid rgba(59,130,246,0.25)' }}>
                      <DownloadSimple size={18} /> Exportar Excel
                    </button>
                  </>
                ) : (
                  <EmptyState icon={ChartBar} title="Sin datos" description="No hay registros en el período seleccionado." />
                )}
              </div>
            )}

            {/* Ranking tab */}
            {activeTab === 'ranking' && (
              <div className="flex flex-col gap-3">
                {ranking.length === 0 ? (
                  <EmptyState icon={Trophy} title="Sin datos" />
                ) : (
                  <>
                    {ranking.map((r, i) => {
                      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`
                      const color = r.pct >= 70 ? 'var(--green)' : r.pct >= 40 ? 'var(--amber)' : 'var(--red)'
                      return (
                        <div key={r.id} className="flex items-center gap-3 px-4 py-3 rounded-[12px]"
                          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                          <span className="text-sm font-bold w-6 text-center flex-shrink-0" style={{ color: 'var(--text-3)' }}>{medal}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold truncate" style={{ color: 'var(--text)' }}>{r.name}</p>
                            <p className="text-xs" style={{ color: 'var(--text-2)' }}>{r.present} asist. de {r.total} reuniones</p>
                          </div>
                          <span className="font-syne font-extrabold text-xl flex-shrink-0" style={{ color }}>{r.pct}%</span>
                        </div>
                      )
                    })}
                    <button
                      onClick={() => exportRankingReport(ranking)}
                      className="h-12 rounded-[12px] font-bold text-sm flex items-center justify-center gap-2 press"
                      style={{ background: 'rgba(59,130,246,0.12)', color: 'var(--accent)', border: '1px solid rgba(59,130,246,0.25)' }}>
                      <DownloadSimple size={18} /> Exportar Ranking
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Visitors tab */}
            {activeTab === 'visitors' && (
              <div className="flex flex-col gap-3">
                {visitors.length === 0 ? (
                  <EmptyState icon={Handshake} title="Sin visitantes" />
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: 'Total',         value: visitors.length,                                    color: 'var(--accent)' },
                        { label: 'Seguimiento',   value: visitors.filter(v => v.status === 'following').length, color: 'var(--amber)' },
                        { label: 'Consolidados',  value: visitors.filter(v => v.status === 'converted').length, color: 'var(--green)' },
                      ].map(s => (
                        <div key={s.label} className="flex flex-col items-center gap-1 p-3 rounded-[12px]"
                          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                          <span className="font-syne font-extrabold text-2xl" style={{ color: s.color }}>{s.value}</span>
                          <span className="text-[10px] font-bold uppercase tracking-wide text-center" style={{ color: 'var(--text-2)' }}>{s.label}</span>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => exportVisitorsReport(visitors)}
                      className="h-12 rounded-[12px] font-bold text-sm flex items-center justify-center gap-2 press"
                      style={{ background: 'rgba(59,130,246,0.12)', color: 'var(--accent)', border: '1px solid rgba(59,130,246,0.25)' }}>
                      <DownloadSimple size={18} /> Exportar Excel
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
