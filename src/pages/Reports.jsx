import { useState, useEffect, useMemo } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import {
  DownloadSimple, ChartBar, Users, Trophy, Star, ListBullets, HandHeart, CaretDown, CaretUp
} from '@phosphor-icons/react'
import {
  exportAttendanceReport,
  exportRankingReport, exportMembersList, exportMeetingAttendeesList, exportInvitationRanking
} from '../utils/excel'
import { localDateStr, todayStr, formatDateShort } from '../utils/dates'
import { memberInGroup, memberInAnyGroup } from '../utils/members'
import { usePersistedState } from '../hooks/usePersistedState'

export default function Reports() {
  const { profile } = useAuth()
  const isLeader = profile?.role === 'leader'

  const [records,  setRecords]  = useState([])
  const [members,  setMembers]  = useState([])
  const [groups,   setGroups]   = useState([])
  const [loading,  setLoading]  = useState(true)
  const [selGroup,  setSelGroup]  = usePersistedState('rep_group', '')
  const [dateFrom,  setDateFrom]  = usePersistedState('rep_from', localDateStr(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)))
  const [dateTo,    setDateTo]    = usePersistedState('rep_to',   todayStr())
  const [activeTab, setActiveTab] = usePersistedState('rep_tab', 'summary')
  const [expandedInviters, setExpandedInviters] = useState(new Set())

  // Listas tab state
  const [listGroup,   setListGroup]   = usePersistedState('rep_list_group', '')
  const [listMeeting, setListMeeting] = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [aSnap, mSnap, gSnap] = await Promise.all([
        getDocs(collection(db, 'attendance')),
        getDocs(collection(db, 'members')),
        getDocs(collection(db, 'groups')),
      ])
      const recs = aSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      recs.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      setRecords(recs)
      setMembers(mSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      const allGroups = gSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      // Leaders only see their assigned groups
      const visibleGroups = profile?.role === 'leader'
        ? allGroups.filter(g => (profile.groupIds || []).includes(g.id))
        : allGroups
      setGroups(visibleGroups)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const filteredRecords = useMemo(() => {
    const leaderGroupIds = isLeader ? (profile?.groupIds || []) : null
    return records.filter(r => {
      const inGroup = selGroup
        ? r.groupId === selGroup
        : leaderGroupIds ? leaderGroupIds.includes(r.groupId) : true
      const inDate = (!dateFrom || r.date >= dateFrom) && (!dateTo || r.date <= dateTo)
      return inGroup && inDate
    })
  }, [records, selGroup, dateFrom, dateTo, isLeader, profile])

  const filteredMembers = useMemo(() => {
    const leaderGroupIds = isLeader ? (profile?.groupIds || []) : null
    if (selGroup) return members.filter(m => memberInGroup(m, selGroup))
    if (leaderGroupIds) return members.filter(m => memberInAnyGroup(m, leaderGroupIds))
    return members
  }, [members, selGroup, isLeader, profile])

  // Ranking report data
  const ranking = useMemo(() => {
    return filteredMembers.map(m => {
      let present = 0, late = 0, total = 0
      filteredRecords.forEach(r => {
        if (m.joinDate && r.date < m.joinDate) return  // no contar reuniones antes del ingreso
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
    const last       = filteredRecords[0]
    const eligibleIds = new Set(filteredMembers.filter(m => !m.joinDate || m.joinDate <= last.date).map(m => m.id))
    const total   = eligibleIds.size
    const present = Object.entries(last.records || {}).filter(([id, v]) => eligibleIds.has(id) && v === 'present').length
    const pct     = total > 0 ? Math.round((present / total) * 100) : 0
    return { date: last.date, total, present, pct }
  }, [filteredRecords, filteredMembers])

  // New members who attended in the filtered records
  const newAttendees = useMemo(() => {
    const attendedIds = new Set()
    filteredRecords.forEach(r => {
      Object.entries(r.records || {}).forEach(([id, status]) => {
        if (status === 'present') attendedIds.add(id)
      })
    })
    const grpMap = Object.fromEntries(groups.map(g => [g.id, g.name]))
    return filteredMembers
      .filter(m => m.spiritualStatus === 'new' && attendedIds.has(m.id))
      .map(m => ({ ...m, _groupName: grpMap[m.groupId] || '', _attendCount: filteredRecords.filter(r => r.records?.[m.id] === 'present').length }))
      .sort((a, b) => b._attendCount - a._attendCount)
  }, [filteredRecords, filteredMembers, groups])

  // Invitation ranking
  const invitationRanking = useMemo(() => {
    const counts = {}
    filteredMembers.forEach(m => {
      if (!m.referredById) return
      if (dateFrom && m.joinDate && m.joinDate < dateFrom) return
      if (dateTo   && m.joinDate && m.joinDate > dateTo)   return
      if (!counts[m.referredById]) counts[m.referredById] = []
      counts[m.referredById].push(m)
    })
    return Object.entries(counts)
      .map(([inviterId, invited]) => {
        const inviter = members.find(m => m.id === inviterId)
        return {
          id:      inviterId,
          name:    inviter?.fullName || '—',
          count:   invited.length,
          invited: invited.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '')),
        }
      })
      .sort((a, b) => b.count - a.count)
  }, [filteredMembers, members, dateFrom, dateTo])

  // Data for the Listas tab
  const listGroupMembers = useMemo(() => {
    const leaderGroupIds = isLeader ? (profile?.groupIds || []) : null
    const mems = listGroup
      ? members.filter(m => memberInGroup(m, listGroup) && m.active !== false)
      : leaderGroupIds
        ? members.filter(m => memberInAnyGroup(m, leaderGroupIds) && m.active !== false)
        : members.filter(m => m.active !== false)
    const grpMap = Object.fromEntries(groups.map(g => [g.id, g.name]))
    return mems.map(m => ({ ...m, _groupName: grpMap[m.groupId] || '' }))
  }, [members, groups, listGroup, isLeader, profile])

  const selectedMeetingRecord = useMemo(() => {
    if (!listMeeting) return null
    return records.find(r => r.id === listMeeting) || null
  }, [records, listMeeting])

  const selectedMeetingMembers = useMemo(() => {
    if (!selectedMeetingRecord) return []
    return selectedMeetingRecord.groupId
      ? members.filter(m => memberInGroup(m, selectedMeetingRecord.groupId))
      : members
  }, [selectedMeetingRecord, members])

  const groupName = groups.find(g => g.id === selGroup)?.name || 'Todos'
  const tabs = [
    { id: 'summary',      label: 'Resumen' },
    { id: 'ranking',      label: 'Ranking' },
    { id: 'nuevos',       label: 'Nuevos' },
    { id: 'invitadores',  label: 'Invitadores' },
    { id: 'listas',       label: 'Listas' },
  ]

  function toggleInviter(id) {
    setExpandedInviters(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="flex flex-col" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <h1 className="font-syne font-extrabold text-[17px]" style={{ color: 'var(--text)' }}>Reportes</h1>
      </div>

      {/* Filters (for non-listas tabs) */}
      {activeTab !== 'listas' && (
        <div className="px-4 py-3 flex flex-col gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
          <select value={selGroup} onChange={e => !isLeader && setSelGroup(e.target.value)}
            disabled={isLeader}
            className="w-full rounded-[10px] px-3 py-2.5 text-sm font-medium outline-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit', opacity: isLeader ? 0.7 : 1 }}>
            {!isLeader && <option value="">Todos los grupos</option>}
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
      )}

      {/* Tabs */}
      <div className="flex px-4 pt-3 gap-2 overflow-x-auto" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className="px-4 py-1.5 rounded-full text-xs font-bold press flex-shrink-0"
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
                          { label: 'Miembros',   value: summary.total,   color: 'var(--accent)' },
                          { label: 'Presentes',  value: summary.present, color: 'var(--green)' },
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
                      const eligibleIds = new Set(filteredMembers.filter(m => !m.joinDate || m.joinDate <= r.date).map(m => m.id))
                      const total   = eligibleIds.size
                      const present = Object.entries(r.records || {}).filter(([id, v]) => eligibleIds.has(id) && v === 'present').length
                      const late    = Object.entries(r.records || {}).filter(([id, v]) => eligibleIds.has(id) && v === 'late').length
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

            {/* Nuevos tab */}
            {activeTab === 'nuevos' && (
              <div className="flex flex-col gap-3">
                <p className="text-xs" style={{ color: 'var(--text-2)' }}>
                  Personas con estado <strong style={{ color: 'var(--amber)' }}>Nuevo</strong> que asistieron al menos una vez en el período seleccionado.
                </p>
                {newAttendees.length === 0 ? (
                  <EmptyState icon={Star} title="Sin nuevos" description="No hay personas nuevas con asistencia en este período." />
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col items-center gap-1 p-3 rounded-[12px]"
                        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                        <span className="font-syne font-extrabold text-2xl" style={{ color: 'var(--amber)' }}>{newAttendees.length}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wide text-center" style={{ color: 'var(--text-2)' }}>Personas nuevas</span>
                      </div>
                      <div className="flex flex-col items-center gap-1 p-3 rounded-[12px]"
                        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                        <span className="font-syne font-extrabold text-2xl" style={{ color: 'var(--green)' }}>{filteredRecords.length}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wide text-center" style={{ color: 'var(--text-2)' }}>Reuniones</span>
                      </div>
                    </div>
                    {newAttendees.map(m => (
                      <div key={m.id} className="flex items-center gap-3 px-4 py-3 rounded-[12px]"
                        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold truncate" style={{ color: 'var(--text)' }}>{m.fullName}</p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>
                            {m._groupName && <span>{m._groupName} · </span>}
                            {m.referredBy && <span>Invitado por: {m.referredBy} · </span>}
                            {m._attendCount} visita{m._attendCount !== 1 ? 's' : ''}
                          </p>
                        </div>
                        {m.phone && (
                          <a href={`https://wa.me/${m.phone.replace(/\D/g,'')}`} target="_blank" rel="noreferrer"
                            className="text-xs font-bold px-2 py-1 rounded-[6px]"
                            style={{ background: 'var(--green-bg)', color: 'var(--green)', border: '1px solid var(--green-bdr)', flexShrink: 0 }}>
                            WA
                          </a>
                        )}
                      </div>
                    ))}
                    <button
                      onClick={() => {
                        const grpMap = Object.fromEntries(groups.map(g => [g.id, g.name]))
                        exportMembersList(newAttendees.map(m => ({ ...m, _groupName: grpMap[m.groupId] || '' })), `Nuevos_${groupName}`)
                      }}
                      className="h-12 rounded-[12px] font-bold text-sm flex items-center justify-center gap-2 press"
                      style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--amber)', border: '1px solid rgba(245,158,11,0.25)' }}>
                      <DownloadSimple size={18} /> Exportar lista de nuevos
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Invitadores tab */}
            {activeTab === 'invitadores' && (
              <div className="flex flex-col gap-3">
                <p className="text-xs" style={{ color: 'var(--text-2)' }}>
                  Personas que han traído más invitados al grupo en el período seleccionado.
                  Solo cuenta miembros con <strong style={{ color: 'var(--accent)' }}>invitador asignado</strong> y fecha de ingreso dentro del rango.
                </p>

                {invitationRanking.length === 0 ? (
                  <EmptyState icon={HandHeart} title="Sin datos"
                    description="No hay invitaciones registradas en este período. Asigna el campo «Invitado por» al editar un miembro." />
                ) : (
                  <>
                    {/* Totales */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col items-center gap-1 p-3 rounded-[12px]"
                        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                        <span className="font-syne font-extrabold text-2xl" style={{ color: 'var(--accent)' }}>
                          {invitationRanking.length}
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-wide text-center" style={{ color: 'var(--text-2)' }}>
                          Invitadores
                        </span>
                      </div>
                      <div className="flex flex-col items-center gap-1 p-3 rounded-[12px]"
                        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                        <span className="font-syne font-extrabold text-2xl" style={{ color: 'var(--green)' }}>
                          {invitationRanking.reduce((s, r) => s + r.count, 0)}
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-wide text-center" style={{ color: 'var(--text-2)' }}>
                          Total invitados
                        </span>
                      </div>
                    </div>

                    {/* Lista */}
                    {invitationRanking.map((r, i) => {
                      const medal    = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`
                      const expanded = expandedInviters.has(r.id)
                      return (
                        <div key={r.id} className="rounded-[12px] overflow-hidden"
                          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                          {/* Fila principal */}
                          <button type="button" onClick={() => toggleInviter(r.id)}
                            className="w-full flex items-center gap-3 px-4 py-3 press text-left">
                            <span className="text-sm font-bold w-6 text-center flex-shrink-0"
                              style={{ color: 'var(--text-3)' }}>{medal}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold truncate" style={{ color: 'var(--text)' }}>{r.name}</p>
                              <p className="text-xs" style={{ color: 'var(--text-2)' }}>
                                {r.count} persona{r.count !== 1 ? 's' : ''} invitada{r.count !== 1 ? 's' : ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="font-syne font-extrabold text-xl" style={{ color: 'var(--accent)' }}>
                                {r.count}
                              </span>
                              {expanded
                                ? <CaretUp size={14} style={{ color: 'var(--text-3)' }} />
                                : <CaretDown size={14} style={{ color: 'var(--text-3)' }} />}
                            </div>
                          </button>

                          {/* Lista expandida de invitados */}
                          {expanded && (
                            <div style={{ borderTop: '1px solid var(--border)' }}>
                              {r.invited.map((m, mi) => (
                                <div key={m.id}
                                  className="flex items-center gap-3 px-4 py-2.5"
                                  style={{
                                    borderTop: mi > 0 ? '1px solid var(--border)' : 'none',
                                    background: 'var(--card)',
                                  }}>
                                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                    style={{ background: 'var(--accent)' }} />
                                  <span className="flex-1 text-sm" style={{ color: 'var(--text)' }}>{m.fullName}</span>
                                  {m.joinDate && (
                                    <span className="text-xs" style={{ color: 'var(--text-3)' }}>{m.joinDate}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}

                    <button
                      onClick={() => exportInvitationRanking(invitationRanking, groupName)}
                      className="h-12 rounded-[12px] font-bold text-sm flex items-center justify-center gap-2 press"
                      style={{ background: 'rgba(59,130,246,0.12)', color: 'var(--accent)', border: '1px solid rgba(59,130,246,0.25)' }}>
                      <DownloadSimple size={18} /> Exportar ranking de invitaciones
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Listas tab */}
            {activeTab === 'listas' && (
              <div className="flex flex-col gap-5">
                {/* Section 1: All members — hidden for leaders */}
                {!isLeader && <div className="flex flex-col gap-3 p-4 rounded-[14px]"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-2">
                    <Users size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Lista completa de personas</p>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-2)' }}>
                    Exporta la lista de todos los miembros registrados con sus datos completos.
                  </p>
                  <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--green)' }}>
                    <span>{members.filter(m => m.active !== false).length} personas activas</span>
                  </div>
                  <button
                    onClick={() => exportMembersList(
                      members.filter(m => m.active !== false).map(m => ({
                        ...m,
                        _groupName: groups.find(g => g.id === m.groupId)?.name || ''
                      })),
                      'Todos'
                    )}
                    className="h-11 rounded-[10px] font-bold text-sm flex items-center justify-center gap-2 press"
                    style={{ background: 'rgba(59,130,246,0.12)', color: 'var(--accent)', border: '1px solid rgba(59,130,246,0.25)' }}>
                    <DownloadSimple size={16} /> Exportar todas las personas
                  </button>
                </div>}

                {/* Section 2: Members by group */}
                <div className="flex flex-col gap-3 p-4 rounded-[14px]"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-2">
                    <ListBullets size={16} style={{ color: 'var(--amber)', flexShrink: 0 }} />
                    <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Lista por grupo</p>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-2)' }}>
                    Selecciona un grupo para exportar su lista de personas.
                  </p>
                  <select value={listGroup} onChange={e => setListGroup(e.target.value)}
                    className="w-full rounded-[10px] px-3 py-2.5 text-sm font-medium outline-none"
                    style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit' }}>
                    {!isLeader && <option value="">Selecciona un grupo</option>}
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                  {listGroup && (
                    <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--green)' }}>
                      <span>{listGroupMembers.length} personas en este grupo</span>
                    </div>
                  )}
                  <button
                    disabled={!listGroup}
                    onClick={() => {
                      const grp = groups.find(g => g.id === listGroup)
                      exportMembersList(listGroupMembers, grp?.name || listGroup)
                    }}
                    className="h-11 rounded-[10px] font-bold text-sm flex items-center justify-center gap-2 press"
                    style={{
                      background: listGroup ? 'rgba(245,158,11,0.12)' : 'var(--card)',
                      color: listGroup ? 'var(--amber)' : 'var(--text-3)',
                      border: `1px solid ${listGroup ? 'rgba(245,158,11,0.25)' : 'var(--border)'}`,
                    }}>
                    <DownloadSimple size={16} /> Exportar grupo
                  </button>
                </div>

                {/* Section 3: Attendees of a specific meeting */}
                <div className="flex flex-col gap-3 p-4 rounded-[14px]"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-2">
                    <ChartBar size={16} style={{ color: 'var(--green)', flexShrink: 0 }} />
                    <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Asistentes por reunión</p>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-2)' }}>
                    Selecciona una reunión para exportar quién asistió, llegó tarde o estuvo ausente.
                  </p>
                  <select value={listMeeting} onChange={e => setListMeeting(e.target.value)}
                    className="w-full rounded-[10px] px-3 py-2.5 text-sm font-medium outline-none"
                    style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit' }}>
                    <option value="">Selecciona una reunión</option>
                    {records
                      .filter(r => !isLeader || (profile?.groupIds || []).includes(r.groupId))
                      .map(r => {
                        const grp = groups.find(g => g.id === r.groupId)
                        const lbl = `${formatDateShort(r.date)}${grp ? ` — ${grp.name}` : ''}`
                        return <option key={r.id} value={r.id}>{lbl}</option>
                      })}
                  </select>
                  {selectedMeetingRecord && (
                    <div className="text-xs" style={{ color: 'var(--text-2)' }}>
                      {Object.values(selectedMeetingRecord.records || {}).filter(v => v === 'present' || v === 'late').length} presentes ·{' '}
                      {Object.values(selectedMeetingRecord.records || {}).filter(v => v === 'absent').length} ausentes
                    </div>
                  )}
                  <button
                    disabled={!listMeeting}
                    onClick={() => {
                      if (!selectedMeetingRecord) return
                      const grp    = groups.find(g => g.id === selectedMeetingRecord.groupId)
                      const grpMap = Object.fromEntries(groups.map(g => [g.id, g.name]))
                      const allWithGroup = members.map(m => ({ ...m, _groupName: grpMap[m.groupId] || '' }))
                      exportMeetingAttendeesList(selectedMeetingRecord, selectedMeetingMembers, allWithGroup, grp?.name || '')
                    }}
                    className="h-11 rounded-[10px] font-bold text-sm flex items-center justify-center gap-2 press"
                    style={{
                      background: listMeeting ? 'rgba(34,197,94,0.12)' : 'var(--card)',
                      color: listMeeting ? 'var(--green)' : 'var(--text-3)',
                      border: `1px solid ${listMeeting ? 'rgba(34,197,94,0.25)' : 'var(--border)'}`,
                    }}>
                    <DownloadSimple size={16} /> Exportar asistentes
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
