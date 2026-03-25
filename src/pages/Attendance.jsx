import { useState, useEffect, useMemo, useRef } from 'react'
import { usePersistedState } from '../hooks/usePersistedState'
import { collection, getDocs, doc, getDoc, setDoc, addDoc, updateDoc, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useNavigate } from 'react-router-dom'
import Avatar from '../components/ui/Avatar'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import {
  MagnifyingGlass, CheckCircle, XCircle,
  UserPlus, CloudCheck, Warning, CalendarBlank, ArrowCounterClockwise
} from '@phosphor-icons/react'
import { todayStr, formatDateShort } from '../utils/dates'

export default function Attendance() {
  const { profile } = useAuth()
  const { ok, error: toastError } = useToast()
  const navigate = useNavigate()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'

  const [groups,       setGroups]       = useState([])
  const [selGroup,     setSelGroup]     = usePersistedState('att_group', '')
  const [selDate,      setSelDate]      = usePersistedState('att_date', todayStr())
  const [members,          setMembers]          = useState([])  // current group active members
  const [inactiveMembers,  setInactiveMembers]  = useState([])  // current group inactive members
  const [extraMembers,     setExtraMembers]     = useState([])  // cross-group members already in this attendance
  const [allMembers,       setAllMembers]       = useState([])  // ALL members across groups
  const membersRef = useRef([])
  const [attendance,    setAttendance]    = useState({})
  const [meetingExists, setMeetingExists] = useState(false)
  const [search,        setSearch]        = useState('')
  const [loading,       setLoading]       = useState(true)

  // Auto-save state
  const saveTimerRef  = useRef(null)
  const [saveStatus,  setSaveStatus] = useState('idle') // 'idle' | 'saving' | 'saved' | 'error'

  // Inline add
  const [newName,       setNewName]       = useState('')
  const [newPhone,      setNewPhone]      = useState('')
  const [newReferredBy, setNewReferredBy] = useState('')
  const [addingMember,  setAddingMember]  = useState(false)

  useEffect(() => { loadGroups() }, [profile])

  async function loadGroups() {
    try {
      const snap = await getDocs(collection(db, 'groups'))
      let grps = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(g => g.active !== false)
      if (!isAdmin) grps = grps.filter(g => (profile?.groupIds || []).includes(g.id))
      setGroups(grps)
      if (grps.length === 1) setSelGroup(grps[0].id)
      else if (grps.length === 0) setSelGroup('__default__')
    } catch {
      setSelGroup('__default__')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (selGroup) loadMembersAndAttendance()
  }, [selGroup, selDate])

  async function loadMembersAndAttendance() {
    setLoading(true)
    try {
      const mSnap = await getDocs(collection(db, 'members'))
      const all = mSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      all.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', 'es'))
      const allActive = all.filter(m => m.active !== false)
      setAllMembers(allActive)

      const belongsToGroup = (m) => {
        if (selGroup === '__default__') return !m.groupId && (!m.groupIds || m.groupIds.length === 0)
        const mGroupIds = m.groupIds?.length > 0 ? m.groupIds : (m.groupId ? [m.groupId] : [])
        return mGroupIds.includes(selGroup)
      }

      let groupMems = allActive.filter(belongsToGroup)

      // For past dates, only show members who had already joined this group by that date
      if (selDate < todayStr()) {
        groupMems = groupMems.filter(m => {
          const effectiveJoinDate = selGroup !== '__default__' && m.groupJoinDates?.[selGroup]
            ? m.groupJoinDates[selGroup]
            : m.joinDate
          return !effectiveJoinDate || effectiveJoinDate <= selDate
        })
      }
      setMembers(groupMems)
      membersRef.current = groupMems

      // Inactive members of this group (for the "Activar" section)
      const inactiveGroupMems = all
        .filter(m => m.active === false && belongsToGroup(m))
        .sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', 'es'))
      setInactiveMembers(inactiveGroupMems)

      // Load existing attendance
      const docId = selGroup === '__default__' ? selDate : `${selGroup}_${selDate}`
      let initAtt = {}
      let meetingExists = false
      const attSnap = await getDoc(doc(db, 'attendance', docId))
      if (attSnap.exists()) {
        const raw = attSnap.data().records || {}
        initAtt = Object.fromEntries(Object.entries(raw).filter(([, v]) => v != null))
        meetingExists = true
      } else if (selGroup !== '__default__') {
        const legacySnap = await getDoc(doc(db, 'attendance', selDate))
        if (legacySnap.exists()) {
          const raw = legacySnap.data().records || {}
          initAtt = Object.fromEntries(Object.entries(raw).filter(([, v]) => v != null))
          meetingExists = true
        }
      }

      // Auto-mark absent for past dates only if a meeting record exists for that date.
      // If no record exists → no meeting happened that day → don't auto-mark.
      // Also skip members whose joinDate is after the meeting date (they weren't in the group yet).
      const isPast = selDate < todayStr()
      if (isPast && meetingExists) {
        let autoAbsentAdded = false
        groupMems.forEach(m => {
          const effectiveJoinDate = selGroup !== '__default__' && m.groupJoinDates?.[selGroup]
            ? m.groupJoinDates[selGroup]
            : m.joinDate
          if (!(m.id in initAtt) && (!effectiveJoinDate || effectiveJoinDate <= selDate)) {
            initAtt[m.id] = 'absent'
            autoAbsentAdded = true
          }
        })
        // Remove any records for members who hadn't joined this group yet (leftover from old data)
        Object.keys(initAtt).forEach(memberId => {
          const member = all.find(m => m.id === memberId)
          if (member) {
            const effectiveJoinDate = selGroup !== '__default__' && member.groupJoinDates?.[selGroup]
              ? member.groupJoinDates[selGroup]
              : member.joinDate
            if (effectiveJoinDate && effectiveJoinDate > selDate) {
              delete initAtt[memberId]
            }
          }
        })
        // Persist auto-absent entries to Firestore so they don't reset on reload
        if (autoAbsentAdded) doAutoSave(initAtt)
      }
      setAttendance(initAtt)
      setMeetingExists(meetingExists)

      // Extra members: from other groups already in this attendance record
      // For past dates, exclude members who hadn't joined yet
      const recordedIds = Object.keys(initAtt)
      const groupAllIds = new Set([...groupMems.map(m => m.id), ...inactiveGroupMems.map(m => m.id)])
      const extra = all.filter(m =>
        !groupAllIds.has(m.id) &&
        recordedIds.includes(m.id) &&
        (!isPast || !m.joinDate || m.joinDate <= selDate)
      )
      setExtraMembers(extra)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  // Auto-save with debounce
  function scheduleAutoSave(att) {
    if (!selGroup) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setSaveStatus('saving')
    saveTimerRef.current = setTimeout(() => doAutoSave(att), 700)
  }

  async function doAutoSave(att) {
    try {
      const docId = selGroup === '__default__' ? selDate : `${selGroup}_${selDate}`
      // Strip null/undefined entries so they don't pollute Firestore
      const cleanAtt = Object.fromEntries(Object.entries(att).filter(([, v]) => v != null))
      const present = Object.values(cleanAtt).filter(x => x === 'present').length
      const absent  = Object.values(cleanAtt).filter(x => x === 'absent').length
      await setDoc(doc(db, 'attendance', docId), {
        groupId:      selGroup === '__default__' ? null : selGroup,
        date:         selDate,
        leaderId:     profile.uid,
        records:      cleanAtt,
        totalPresent: present,
        totalAbsent:  absent,
        savedAt:      new Date().toISOString(),
      }, { merge: true })
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
      checkAutoDeactivate()
    } catch {
      setSaveStatus('error')
    }
  }

  useEffect(() => { membersRef.current = members }, [members])

  function mark(memberId, status) {
    setAttendance(prev => {
      const next = { ...prev }
      if (next[memberId] === status) delete next[memberId]
      else next[memberId] = status
      scheduleAutoSave(next)
      return next
    })
  }

  async function handleActivateMember(member) {
    try {
      await updateDoc(doc(db, 'members', member.id), { active: true })
      const activated = { ...member, active: true }
      setInactiveMembers(prev => prev.filter(m => m.id !== member.id))
      setMembers(prev => [...prev, activated].sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', 'es')))
      setAllMembers(prev => [...prev, activated].sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', 'es')))
      ok(`${member.fullName} reactivado`)
    } catch {
      toastError('Error al reactivar')
    }
  }

  async function checkAutoDeactivate() {
    const currentMembers = membersRef.current
    if (!currentMembers.length || !selGroup || selGroup === '__default__') return
    try {
      const cfgSnap = await getDoc(doc(db, 'config', 'general'))
      const threshold = cfgSnap.exists() ? (cfgSnap.data().inactiveAfterMeetings || 8) : 8

      const attSnap = await getDocs(query(collection(db, 'attendance'), where('groupId', '==', selGroup)))
      const attDocs = attSnap.docs
        .map(d => d.data())
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))

      const toDeactivate = []
      currentMembers.forEach(m => {
        const relevant = attDocs.filter(a => !m.joinDate || a.date >= m.joinDate)
        const lastN = relevant.slice(0, threshold)
        const consecutiveAbsences = lastN.filter(a => a.records?.[m.id] === 'absent').length
        if (relevant.length < threshold) return
        if (consecutiveAbsences >= threshold) toDeactivate.push(m)
      })
      if (toDeactivate.length === 0) return

      await Promise.all(toDeactivate.map(m => updateDoc(doc(db, 'members', m.id), { active: false })))

      const deactivateIds = new Set(toDeactivate.map(m => m.id))
      setMembers(prev => prev.filter(m => !deactivateIds.has(m.id)))
      setInactiveMembers(prev =>
        [...prev, ...toDeactivate.map(m => ({ ...m, active: false }))]
          .sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', 'es'))
      )
    } catch (e) {
      console.error('Auto-deactivate error:', e)
    }
  }

  async function addMemberToGroup(member) {
    try {
      const currentGroupIds = member.groupIds?.length > 0 ? member.groupIds : (member.groupId ? [member.groupId] : [])
      if (currentGroupIds.includes(selGroup)) return
      const newGroupIds = [...currentGroupIds, selGroup]
      // Store the date when this member joined this specific group
      const groupJoinDates = { ...(member.groupJoinDates || {}), [selGroup]: selDate }
      await updateDoc(doc(db, 'members', member.id), { groupIds: newGroupIds, groupJoinDates })
      const updated = { ...member, groupIds: newGroupIds, groupJoinDates }
      setMembers(prev => [...prev, updated].sort((a, b) => a.fullName.localeCompare(b.fullName, 'es')))
      setExtraMembers(prev => prev.filter(em => em.id !== member.id))
      setAllMembers(prev => prev.map(am => am.id === member.id ? updated : am))
      ok(`${member.fullName} añadido al grupo`)
    } catch {
      toastError('Error al añadir al grupo')
    }
  }

  // Current group filtered
  const filteredGroup = useMemo(() => {
    if (!search.trim()) return members
    const q = search.toLowerCase()
    return members.filter(m =>
      (m.fullName || '').toLowerCase().includes(q) ||
      (m.phone || '').includes(q)
    )
  }, [members, search])

  // Inactive members of this group matching search (or all if no search)
  const filteredInactive = useMemo(() => {
    if (!search.trim()) return inactiveMembers
    const q = search.toLowerCase()
    return inactiveMembers.filter(m =>
      (m.fullName || '').toLowerCase().includes(q) ||
      (m.phone || '').includes(q)
    )
  }, [inactiveMembers, search])

  // From other groups matching search
  const filteredOtherGroups = useMemo(() => {
    if (!search.trim()) return []
    const q = search.toLowerCase()
    const currentIds = new Set([...members.map(m => m.id), ...extraMembers.map(m => m.id), ...inactiveMembers.map(m => m.id)])
    return allMembers.filter(m =>
      !currentIds.has(m.id) && (
        (m.fullName || '').toLowerCase().includes(q) ||
        (m.phone || '').includes(q)
      )
    )
  }, [allMembers, members, extraMembers, search])

  const nameExistsAnywhere = useMemo(() => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return allMembers.some(m => (m.fullName || '').toLowerCase() === q)
  }, [allMembers, search])

  const showAddCard = search.trim() && !nameExistsAnywhere &&
    filteredGroup.length === 0 && filteredOtherGroups.length === 0

  const counts = useMemo(() => {
    const activeMemberIds = new Set(members.map(m => m.id))
    return {
      present: Object.entries(attendance).filter(([id, v]) => activeMemberIds.has(id) && v === 'present').length,
      absent:  Object.entries(attendance).filter(([id, v]) => activeMemberIds.has(id) && v === 'absent').length,
    }
  }, [attendance, members])

  async function handleAddMember() {
    const name = newName.trim() || search.trim()
    if (!name) return
    setAddingMember(true)
    try {
      const newMember = {
        fullName:        name,
        phone:           newPhone.trim() || null,
        referredBy:      newReferredBy.trim() || null,
        active:          true,
        groupId:         selGroup === '__default__' ? null : selGroup,
        spiritualStatus: 'new',
        joinDate:        todayStr(),
        createdAt:       new Date().toISOString(),
      }
      const ref = await addDoc(collection(db, 'members'), newMember)
      const m = { id: ref.id, ...newMember }
      // Add to members list
      setMembers(prev => [...prev, m].sort((a, b) => a.fullName.localeCompare(b.fullName, 'es')))
      setAllMembers(prev => [...prev, m].sort((a, b) => a.fullName.localeCompare(b.fullName, 'es')))
      // Mark present and save
      const newAtt = { ...attendance, [ref.id]: 'present' }
      setAttendance(newAtt)
      scheduleAutoSave(newAtt)
      setSearch('')
      setNewName('')
      setNewPhone('')
      setNewReferredBy('')
      ok(`${name} registrado y marcado presente`)
      // Redirect to full form to complete the profile
      navigate(`/members/${ref.id}/edit`)
    } catch {
      toastError('Error al agregar')
    } finally {
      setAddingMember(false)
    }
  }

  if (loading && !selGroup) return <LoadingSpinner fullScreen />

  const isPast    = selDate < todayStr()
  const groupName = groups.find(g => g.id === selGroup)?.name || 'General'
  const dateLabel = formatDateShort(selDate)
  const getGroupName = (groupId) => groups.find(g => g.id === groupId)?.name || allMembers.find(m => m.groupId === groupId) ? (groups.find(g => g.id === groupId)?.name || 'Otro grupo') : 'Otro grupo'

  function MemberCard({ m, showGroupBadge = false, onAddToGroup }) {
    const st = attendance[m.id]
    return (
      <div className="flex items-center gap-3 rounded-[10px] px-3 py-2.5 mb-2"
        style={{
          background: 'var(--surface)',
          border: `1px solid ${st === 'present' ? 'rgba(34,197,94,0.3)' : st === 'absent' ? 'rgba(239,68,68,0.25)' : 'var(--border)'}`,
        }}>
        <button onClick={() => navigate(`/members/${m.id}`)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
        <Avatar name={m.fullName} size={40} status={st} />
        <div className="min-w-0">
          <p className="text-sm font-bold truncate" style={{ color: 'var(--text)' }}>{m.fullName?.toUpperCase()}</p>
          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
            {m.spiritualStatus === 'new' && (
              <span className="text-[9px] font-extrabold uppercase tracking-[0.8px] px-1.5 py-0.5 rounded-[4px]"
                style={{ background: 'var(--amber-bg)', color: 'var(--amber)', border: '1px solid rgba(245,158,11,0.25)' }}>
                Nuevo
              </span>
            )}
            {showGroupBadge && m.groupId && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-[4px]"
                style={{ background: 'rgba(59,130,246,0.1)', color: 'var(--accent)', border: '1px solid rgba(59,130,246,0.2)' }}>
                {groups.find(g => g.id === m.groupId)?.name || 'Otro grupo'}
              </span>
            )}
            {onAddToGroup && (
              <button
                onClick={(e) => { e.stopPropagation(); onAddToGroup() }}
                className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-[4px] press-sm"
                style={{ background: 'rgba(59,130,246,0.12)', color: 'var(--accent)', border: '1px solid rgba(59,130,246,0.25)' }}>
                + añadir al grupo
              </button>
            )}
          </div>
        </div>
        </button>
        {/* Present / Absent buttons — hidden for past dates with no meeting record */}
        {!(isPast && !meetingExists) && (
          <div className="flex gap-1.5 flex-shrink-0">
            <button onClick={() => mark(m.id, 'present')}
              className="w-10 h-10 rounded-[9px] flex items-center justify-center press-sm"
              style={{ background: st === 'present' ? 'var(--green-bg)' : 'var(--card)', border: `1px solid ${st === 'present' ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`, color: st === 'present' ? 'var(--green)' : 'var(--text-2)' }}>
              <CheckCircle size={22} weight={st === 'present' ? 'fill' : 'regular'} />
            </button>
            <button onClick={() => mark(m.id, 'absent')}
              className="w-10 h-10 rounded-[9px] flex items-center justify-center press-sm"
              style={{ background: st === 'absent' ? 'var(--red-bg)' : 'var(--card)', border: `1px solid ${st === 'absent' ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`, color: st === 'absent' ? 'var(--red)' : 'var(--text-2)' }}>
              <XCircle size={22} weight={st === 'absent' ? 'fill' : 'regular'} />
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      {/* Top bar */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <div className="flex-1">
          <h1 className="font-syne font-extrabold text-[17px]" style={{ color: 'var(--text)' }}>Asistencia</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>{dateLabel} · {groupName}</p>
        </div>
        {/* Auto-save status */}
        <div className="flex items-center gap-1.5">
          {saveStatus === 'saving' && (
            <span className="text-[10px] font-bold" style={{ color: 'var(--text-3)' }}>Guardando…</span>
          )}
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1 text-[10px] font-bold" style={{ color: 'var(--green)' }}>
              <CloudCheck size={14} /> Guardado
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="flex items-center gap-1 text-[10px] font-bold" style={{ color: 'var(--red)' }}>
              <Warning size={14} /> Error
            </span>
          )}
        </div>
      </div>

      {/* Group + date selector */}
      <div className="px-4 py-3 flex gap-2" style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
        {(isAdmin || groups.length > 1) && (
          <select value={selGroup} onChange={e => setSelGroup(e.target.value)}
            className="flex-1 rounded-[10px] px-3 py-2.5 text-sm font-medium outline-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit' }}>
            <option value="">-- Grupo --</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}
        <input type="date" value={selDate} onChange={e => setSelDate(e.target.value)}
          className="flex-1 rounded-[10px] px-3 py-2.5 text-sm font-medium outline-none"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit', colorScheme: 'dark' }} />
      </div>

      {/* Search */}
      <div className="px-4 py-2 sticky top-[72px] z-[9]" style={{ background: 'var(--bg)' }}>
        <div className="flex items-center gap-2 rounded-[12px] px-4"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          onFocusCapture={e => e.currentTarget.style.borderColor = 'var(--accent)'}
          onBlurCapture={e  => e.currentTarget.style.borderColor = 'var(--border)'}>
          <MagnifyingGlass size={18} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar persona..."
            className="flex-1 bg-transparent py-3 text-sm font-medium outline-none"
            style={{ color: 'var(--text)', fontFamily: 'inherit' }} />
        </div>
      </div>

      {/* Members list */}
      <div className="flex-1 px-4 pb-28">
        {loading ? <LoadingSpinner /> : (
          <>
            {/* No-meeting banner for past dates */}
            {isPast && !meetingExists && members.length > 0 && (
              <div className="mb-3 mt-1 flex items-center gap-3 px-4 py-3 rounded-[12px]"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <CalendarBlank size={16} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                <p className="text-xs" style={{ color: 'var(--text-2)' }}>
                  No hay reunión registrada para esta fecha.
                </p>
              </div>
            )}

            {/* NEW PERSON CARD */}
            {showAddCard && (
              <div className="mb-3 rounded-[12px] p-4" style={{ background: 'var(--card)', border: '1.5px dashed rgba(245,158,11,0.3)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <UserPlus size={14} style={{ color: 'var(--amber)' }} />
                  <span className="text-[11px] font-extrabold uppercase tracking-[1px]" style={{ color: 'var(--amber)' }}>
                    Nueva persona
                  </span>
                </div>
                <p className="text-xs mb-3 leading-relaxed" style={{ color: 'var(--text-2)' }}>
                  No encontrado. Completa los datos básicos, se guardará el registro y podrás completar su perfil.
                </p>
                <div className="flex flex-col gap-2">
                  <input value={newName || search} onChange={e => setNewName(e.target.value)}
                    placeholder="Nombre completo *"
                    className="rounded-[9px] px-4 py-2.5 text-sm font-medium outline-none"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit' }}
                    onFocus={e => e.target.style.borderColor = 'var(--amber)'}
                    onBlur={e  => e.target.style.borderColor = 'var(--border)'} />
                  <input value={newPhone} onChange={e => setNewPhone(e.target.value)}
                    placeholder="WhatsApp (opcional)" type="tel"
                    className="rounded-[9px] px-4 py-2.5 text-sm font-medium outline-none"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit' }}
                    onFocus={e => e.target.style.borderColor = 'var(--amber)'}
                    onBlur={e  => e.target.style.borderColor = 'var(--border)'} />
                  <input value={newReferredBy} onChange={e => setNewReferredBy(e.target.value)}
                    placeholder="¿Quién lo invitó? (opcional)"
                    className="rounded-[9px] px-4 py-2.5 text-sm font-medium outline-none"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit' }}
                    onFocus={e => e.target.style.borderColor = 'var(--amber)'}
                    onBlur={e  => e.target.style.borderColor = 'var(--border)'} />
                  <button onClick={handleAddMember} disabled={addingMember}
                    className="flex items-center justify-center gap-2 py-3 rounded-[9px] text-sm font-extrabold press"
                    style={{ background: 'var(--amber)', color: '#08090e' }}>
                    {addingMember
                      ? <span className="w-4 h-4 rounded-full border-2 border-[#08090e33] border-t-[#08090e] animate-spin-slow" />
                      : <><UserPlus size={15} weight="bold" /> Registrar y marcar presente →</>
                    }
                  </button>
                </div>
              </div>
            )}

            {/* Empty state */}
            {filteredGroup.length === 0 && filteredOtherGroups.length === 0 && !showAddCard && (
              <div className="flex flex-col items-center py-14">
                <p className="text-sm font-semibold" style={{ color: 'var(--text-2)' }}>
                  {members.length === 0 ? 'No hay miembros en este grupo' : 'Sin resultados'}
                </p>
              </div>
            )}

            {/* Count label */}
            {filteredGroup.length > 0 && (
              <p className="text-[11px] font-bold uppercase tracking-widest py-2" style={{ color: 'var(--text-2)' }}>
                {filteredGroup.length} miembro{filteredGroup.length !== 1 ? 's' : ''}
              </p>
            )}

            {/* Current group */}
            {filteredGroup.map(m => <MemberCard key={m.id} m={m} />)}

            {/* Extra: cross-group members already in this attendance */}
            {extraMembers.length > 0 && !search.trim() && (
              <>
                <p className="text-[11px] font-bold uppercase tracking-widest py-2 mt-1" style={{ color: 'var(--text-3)' }}>
                  Visitas de otros grupos
                </p>
                {extraMembers.map(m => <MemberCard key={m.id} m={m} showGroupBadge onAddToGroup={() => addMemberToGroup(m)} />)}
              </>
            )}

            {/* Search: other group matches */}
            {filteredOtherGroups.length > 0 && (
              <>
                <p className="text-[11px] font-bold uppercase tracking-widest py-2 mt-2" style={{ color: 'var(--text-3)' }}>
                  En otros grupos
                </p>
                {filteredOtherGroups.map(m => <MemberCard key={m.id} m={m} showGroupBadge onAddToGroup={() => addMemberToGroup(m)} />)}
              </>
            )}

            {/* Inactive members of this group */}
            {filteredInactive.length > 0 && (
              <>
                <p className="text-[11px] font-bold uppercase tracking-widest py-2 mt-2" style={{ color: 'var(--text-3)' }}>
                  Inactivos del grupo
                </p>
                {filteredInactive.map(m => (
                  <div key={m.id} className="flex items-center gap-3 rounded-[10px] px-3 py-2.5 mb-2"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', opacity: 0.65 }}>
                    <button onClick={() => navigate(`/members/${m.id}`)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                      <Avatar name={m.fullName} size={40} />
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate" style={{ color: 'var(--text)' }}>{m.fullName?.toUpperCase()}</p>
                        <span className="text-[9px] font-extrabold uppercase tracking-[0.8px] px-1.5 py-0.5 rounded-[4px]"
                          style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.2)' }}>
                          Inactivo
                        </span>
                      </div>
                    </button>
                    <button
                      onClick={() => handleActivateMember(m)}
                      className="text-[9px] font-extrabold px-2 py-1.5 rounded-[7px] press-sm flex items-center gap-1"
                      style={{ background: 'rgba(34,197,94,0.12)', color: 'var(--green)', border: '1px solid rgba(34,197,94,0.25)', flexShrink: 0 }}>
                      <ArrowCounterClockwise size={12} weight="bold" />
                      Activar
                    </button>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>

      {/* Bottom counter (no save button) */}
      <div className="fixed bottom-[64px] md:bottom-0 left-0 md:left-[200px] right-0 z-20 flex items-center justify-center gap-8 px-4 py-3"
        style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)', paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <div className="flex flex-col items-center gap-0.5">
          <span className="font-syne font-extrabold text-3xl" style={{ color: 'var(--green)' }}>{counts.present}</span>
          <span className="text-[10px] font-bold uppercase tracking-[0.8px]" style={{ color: 'var(--text-2)' }}>Presentes</span>
        </div>
        <div className="w-px h-8" style={{ background: 'var(--border)' }} />
        <div className="flex flex-col items-center gap-0.5">
          <span className="font-syne font-extrabold text-3xl" style={{ color: 'var(--red)' }}>{counts.absent}</span>
          <span className="text-[10px] font-bold uppercase tracking-[0.8px]" style={{ color: 'var(--text-2)' }}>Ausentes</span>
        </div>
      </div>
    </div>
  )
}
