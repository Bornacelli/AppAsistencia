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
  UserPlus, CloudCheck, Warning
} from '@phosphor-icons/react'
import { todayStr, formatDateShort } from '../utils/dates'

export default function Attendance() {
  const { profile } = useAuth()
  const { ok, error: toastError } = useToast()
  const navigate = useNavigate()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'

  const [groups,       setGroups]       = useState([])
  const [selGroup,     setSelGroup]     = usePersistedState('att_group', '')
  const [selDate,      setSelDate]      = useState(todayStr())
  const [members,      setMembers]      = useState([])       // current group members
  const [extraMembers, setExtraMembers] = useState([])       // cross-group members already in this attendance
  const [allMembers,   setAllMembers]   = useState([])       // ALL members across groups
  const [attendance,   setAttendance]   = useState({})
  const [search,       setSearch]       = useState('')
  const [loading,      setLoading]      = useState(true)

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
      const mSnap = await getDocs(query(collection(db, 'members'), where('active', '==', true)))
      const all = mSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      all.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', 'es'))
      setAllMembers(all)

      let groupMems = all
      if (selGroup !== '__default__') {
        groupMems = all.filter(m => {
          const mGroupIds = m.groupIds?.length > 0 ? m.groupIds : (m.groupId ? [m.groupId] : [])
          return mGroupIds.includes(selGroup)
        })
      } else if (!isAdmin) groupMems = all.filter(m => !m.groupId && (!m.groupIds || m.groupIds.length === 0))

      // For past dates, only show members who had already joined by that date
      if (selDate < todayStr()) {
        groupMems = groupMems.filter(m => !m.joinDate || m.joinDate <= selDate)
      }
      setMembers(groupMems)

      // Load existing attendance
      const docId = selGroup === '__default__' ? selDate : `${selGroup}_${selDate}`
      let initAtt = {}
      const attSnap = await getDoc(doc(db, 'attendance', docId))
      if (attSnap.exists()) {
        initAtt = { ...(attSnap.data().records || {}) }
      } else if (selGroup !== '__default__') {
        const legacySnap = await getDoc(doc(db, 'attendance', selDate))
        if (legacySnap.exists()) initAtt = { ...(legacySnap.data().records || {}) }
      }

      // Auto-mark absent for past dates (members with no record)
      // Skip members whose joinDate is after the meeting date (they weren't in the group yet)
      const isPast = selDate < todayStr()
      if (isPast) {
        groupMems.forEach(m => {
          if (!(m.id in initAtt) && (!m.joinDate || m.joinDate <= selDate)) {
            initAtt[m.id] = 'absent'
          }
        })
        // Remove any records for members who hadn't joined yet (leftover from old data)
        Object.keys(initAtt).forEach(memberId => {
          const member = all.find(m => m.id === memberId)
          if (member && member.joinDate && member.joinDate > selDate) {
            delete initAtt[memberId]
          }
        })
      }
      setAttendance(initAtt)

      // Extra members: from other groups already in this attendance record
      // For past dates, exclude members who hadn't joined yet
      const recordedIds = Object.keys(initAtt)
      const extra = all.filter(m =>
        !groupMems.some(gm => gm.id === m.id) &&
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
      const present = Object.values(att).filter(x => x === 'present').length
      const absent  = Object.values(att).filter(x => x === 'absent').length
      await setDoc(doc(db, 'attendance', docId), {
        groupId:      selGroup === '__default__' ? null : selGroup,
        date:         selDate,
        leaderId:     profile.uid,
        records:      att,
        totalPresent: present,
        totalAbsent:  absent,
        savedAt:      new Date().toISOString(),
      }, { merge: true })
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      setSaveStatus('error')
    }
  }

  function mark(memberId, status) {
    setAttendance(prev => {
      const next = { ...prev }
      if (next[memberId] === status) delete next[memberId]
      else next[memberId] = status
      scheduleAutoSave(next)
      return next
    })
  }

  async function addMemberToGroup(member) {
    try {
      const currentGroupIds = member.groupIds?.length > 0 ? member.groupIds : (member.groupId ? [member.groupId] : [])
      if (currentGroupIds.includes(selGroup)) return
      const newGroupIds = [...currentGroupIds, selGroup]
      await updateDoc(doc(db, 'members', member.id), { groupIds: newGroupIds })
      const updated = { ...member, groupIds: newGroupIds }
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
      (m.shortName || '').toLowerCase().includes(q) ||
      (m.phone || '').includes(q)
    )
  }, [members, search])

  // From other groups matching search
  const filteredOtherGroups = useMemo(() => {
    if (!search.trim()) return []
    const q = search.toLowerCase()
    const currentIds = new Set([...members.map(m => m.id), ...extraMembers.map(m => m.id)])
    return allMembers.filter(m =>
      !currentIds.has(m.id) && (
        (m.fullName || '').toLowerCase().includes(q) ||
        (m.shortName || '').toLowerCase().includes(q) ||
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
    const v = Object.values(attendance)
    return {
      present: v.filter(x => x === 'present').length,
      absent:  v.filter(x => x === 'absent').length,
    }
  }, [attendance])

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
          <p className="text-sm font-bold truncate" style={{ color: 'var(--text)' }}>{m.fullName}</p>
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
        {/* Present / Absent only (no tardanza) */}
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
      <div className="flex-1 px-4 pb-4">
        {loading ? <LoadingSpinner /> : (
          <>
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
          </>
        )}
      </div>

      {/* Bottom counter (no save button) */}
      <div className="fixed bottom-[64px] left-0 right-0 z-20 flex items-center justify-center gap-8 px-4 py-3"
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
