import { useState, useEffect, useMemo } from 'react'
import { collection, getDocs, doc, getDoc, setDoc, addDoc, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import Avatar from '../components/ui/Avatar'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import {
  MagnifyingGlass, CheckCircle, XCircle, Clock,
  UserPlus, FloppyDisk
} from '@phosphor-icons/react'
import { todayStr, formatDateShort, localDateStr } from '../utils/dates'

const STATUS = { present: 'present', absent: 'absent', late: 'late' }

export default function Attendance() {
  const { profile } = useAuth()
  const { ok, error: toastError, info } = useToast()
  const isAdmin = profile?.role === 'admin'

  const [groups,     setGroups]     = useState([])
  const [selGroup,   setSelGroup]   = useState('')
  const [selDate,    setSelDate]    = useState(todayStr())
  const [members,    setMembers]    = useState([])
  const [attendance, setAttendance] = useState({}) // { memberId: 'present'|'absent'|'late' }
  const [search,     setSearch]     = useState('')
  const [saving,     setSaving]     = useState(false)
  const [loading,    setLoading]    = useState(true)
  // Add member inline
  const [newName,    setNewName]    = useState('')
  const [newPhone,   setNewPhone]   = useState('')
  const [addingMember, setAddingMember] = useState(false)

  // Load groups
  useEffect(() => {
    loadGroups()
  }, [profile])

  async function loadGroups() {
    try {
      const snap = await getDocs(collection(db, 'groups'))
      let grps = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(g => g.active !== false)
      if (!isAdmin) {
        grps = grps.filter(g => (profile?.groupIds || []).includes(g.id))
      }
      setGroups(grps)
      if (grps.length === 1) setSelGroup(grps[0].id)
      else if (grps.length === 0) {
        // No groups configured — use a default context
        setSelGroup('__default__')
      }
    } catch {
      setSelGroup('__default__')
    } finally {
      setLoading(false)
    }
  }

  // Load members + existing attendance when group/date changes
  useEffect(() => {
    if (selGroup) loadMembersAndAttendance()
  }, [selGroup, selDate])

  async function loadMembersAndAttendance() {
    setLoading(true)
    try {
      // Members for this group
      const mSnap = await getDocs(query(collection(db, 'members'), where('active', '==', true)))
      let mems = mSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      if (selGroup !== '__default__') {
        mems = mems.filter(m => m.groupId === selGroup)
      } else if (!isAdmin) {
        // For users without group assignment, show members without groupId
        mems = mems.filter(m => !m.groupId)
      }
      mems.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', 'es'))
      setMembers(mems)

      // Existing attendance
      const docId = selGroup === '__default__' ? selDate : `${selGroup}_${selDate}`
      const attSnap = await getDoc(doc(db, 'attendance', docId))
      if (attSnap.exists()) {
        setAttendance({ ...(attSnap.data().records || {}) })
      } else {
        // Try legacy format (just date)
        if (selGroup !== '__default__') {
          const legacySnap = await getDoc(doc(db, 'attendance', selDate))
          if (legacySnap.exists()) {
            setAttendance({ ...(legacySnap.data().records || {}) })
          } else {
            setAttendance({})
          }
        } else {
          setAttendance({})
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  function mark(memberId, status) {
    setAttendance(prev => {
      const next = { ...prev }
      if (next[memberId] === status) delete next[memberId]
      else next[memberId] = status
      return next
    })
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return members
    const q = search.toLowerCase()
    return members.filter(m =>
      (m.fullName || '').toLowerCase().includes(q) ||
      (m.shortName || '').toLowerCase().includes(q) ||
      (m.phone || '').includes(q)
    )
  }, [members, search])

  const showAddCard = search.trim() && !members.some(m => (m.fullName || '').toLowerCase() === search.toLowerCase())

  const counts = useMemo(() => {
    const v = Object.values(attendance)
    return {
      present: v.filter(x => x === 'present').length,
      absent:  v.filter(x => x === 'absent').length,
      late:    v.filter(x => x === 'late').length,
    }
  }, [attendance])

  async function handleAddMember() {
    const name = newName.trim() || search.trim()
    if (!name) return
    setAddingMember(true)
    try {
      const newMember = {
        fullName: name,
        phone: newPhone.trim(),
        active: true,
        groupId: selGroup === '__default__' ? null : selGroup,
        spiritualStatus: 'new',
        joinDate: todayStr(),
        createdAt: new Date().toISOString(),
      }
      const ref = await addDoc(collection(db, 'members'), newMember)
      const m = { id: ref.id, ...newMember }
      setMembers(prev => [...prev, m].sort((a, b) => a.fullName.localeCompare(b.fullName, 'es')))
      setAttendance(prev => ({ ...prev, [ref.id]: 'present' }))
      setSearch('')
      setNewName('')
      setNewPhone('')
      ok(`${name} agregado y marcado presente`)
    } catch {
      toastError('Error al agregar el miembro')
    } finally {
      setAddingMember(false)
    }
  }

  async function handleSave() {
    if (!selGroup) { toastError('Selecciona un grupo'); return }
    setSaving(true)
    try {
      const docId = selGroup === '__default__' ? selDate : `${selGroup}_${selDate}`
      await setDoc(doc(db, 'attendance', docId), {
        groupId:      selGroup === '__default__' ? null : selGroup,
        date:         selDate,
        leaderId:     profile.uid,
        records:      attendance,
        totalPresent: counts.present,
        totalAbsent:  counts.absent,
        totalLate:    counts.late,
        savedAt:      new Date().toISOString(),
      }, { merge: true })
      ok('Asistencia guardada')
    } catch {
      toastError('Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  if (loading && !selGroup) return <LoadingSpinner fullScreen />

  const groupName = groups.find(g => g.id === selGroup)?.name || 'General'
  const dateLabel = formatDateShort(selDate)

  return (
    <div className="flex flex-col" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      {/* Top bar */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <div className="flex-1">
          <h1 className="font-syne font-extrabold text-[17px]" style={{ color: 'var(--text)' }}>Asistencia</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>{dateLabel} · {groupName}</p>
        </div>
      </div>

      {/* Filters: group (if multiple) + date */}
      <div className="px-4 py-3 flex gap-2" style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
        {(isAdmin || groups.length > 1) && (
          <select
            value={selGroup}
            onChange={e => setSelGroup(e.target.value)}
            className="flex-1 rounded-[10px] px-3 py-2.5 text-sm font-medium outline-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit' }}
          >
            <option value="">-- Grupo --</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}
        <input
          type="date"
          value={selDate}
          onChange={e => setSelDate(e.target.value)}
          className="flex-1 rounded-[10px] px-3 py-2.5 text-sm font-medium outline-none"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit', colorScheme: 'dark' }}
        />
      </div>

      {/* Search */}
      <div className="px-4 py-2 sticky top-[72px] z-[9]" style={{ background: 'var(--bg)' }}>
        <div className="flex items-center gap-2 rounded-[12px] px-4"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          onFocusCapture={e => e.currentTarget.style.borderColor = 'var(--accent)'}
          onBlurCapture={e  => e.currentTarget.style.borderColor = 'var(--border)'}>
          <MagnifyingGlass size={18} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar miembro..."
            className="flex-1 bg-transparent py-3 text-sm font-medium outline-none"
            style={{ color: 'var(--text)', fontFamily: 'inherit' }}
          />
        </div>
      </div>

      {/* Members list */}
      <div className="flex-1 px-4 pb-4">
        {loading ? (
          <LoadingSpinner />
        ) : (
          <>
            {/* Add member card */}
            {showAddCard && (
              <div className="mb-3 rounded-[12px] p-4" style={{ background: 'var(--card)', border: '1.5px dashed rgba(245,158,11,0.3)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <UserPlus size={14} style={{ color: 'var(--amber)' }} />
                  <span className="text-[11px] font-extrabold uppercase tracking-[1px]" style={{ color: 'var(--amber)' }}>
                    Nuevo miembro
                  </span>
                </div>
                <p className="text-xs mb-3 leading-relaxed" style={{ color: 'var(--text-2)' }}>
                  No encontrado. Regístralo y márcalo presente.
                </p>
                <div className="flex flex-col gap-2">
                  <input
                    value={newName || search}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="Nombre completo"
                    className="rounded-[9px] px-4 py-2.5 text-sm font-medium outline-none"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit' }}
                    onFocus={e => e.target.style.borderColor = 'var(--amber)'}
                    onBlur={e  => e.target.style.borderColor = 'var(--border)'}
                  />
                  <input
                    value={newPhone}
                    onChange={e => setNewPhone(e.target.value)}
                    placeholder="WhatsApp (opcional)"
                    type="tel"
                    className="rounded-[9px] px-4 py-2.5 text-sm font-medium outline-none"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit' }}
                    onFocus={e => e.target.style.borderColor = 'var(--amber)'}
                    onBlur={e  => e.target.style.borderColor = 'var(--border)'}
                  />
                  <button
                    onClick={handleAddMember}
                    disabled={addingMember}
                    className="flex items-center justify-center gap-2 py-3 rounded-[9px] text-sm font-extrabold press"
                    style={{ background: 'var(--amber)', color: '#08090e' }}
                  >
                    {addingMember
                      ? <span className="w-4 h-4 rounded-full border-2 border-[#08090e33] border-t-[#08090e] animate-spin-slow" />
                      : <><UserPlus size={15} weight="bold" /> Agregar y marcar presente</>
                    }
                  </button>
                </div>
              </div>
            )}

            {/* Empty state */}
            {filtered.length === 0 && !showAddCard && (
              <div className="flex flex-col items-center py-14 gap-3">
                <p className="text-sm font-semibold" style={{ color: 'var(--text-2)' }}>
                  {members.length === 0 ? 'No hay miembros en este grupo' : 'Sin resultados'}
                </p>
              </div>
            )}

            {/* Count label */}
            {filtered.length > 0 && (
              <p className="text-[11px] font-bold uppercase tracking-widest py-2" style={{ color: 'var(--text-2)' }}>
                {filtered.length} miembro{filtered.length !== 1 ? 's' : ''}
              </p>
            )}

            {/* Member cards */}
            {filtered.map(m => {
              const st = attendance[m.id]
              return (
                <div key={m.id} className="flex items-center gap-3 rounded-[10px] px-3 py-2.5 mb-2 transition-colors"
                  style={{
                    background: 'var(--surface)',
                    border: `1px solid ${st === 'present' ? 'rgba(34,197,94,0.3)' : st === 'absent' ? 'rgba(239,68,68,0.25)' : st === 'late' ? 'rgba(245,158,11,0.25)' : 'var(--border)'}`,
                  }}>
                  <Avatar name={m.fullName} size={40} status={st} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate" style={{ color: 'var(--text)' }}>{m.fullName}</p>
                    {m.spiritualStatus === 'new' && (
                      <span className="text-[9px] font-extrabold uppercase tracking-[0.8px] px-1.5 py-0.5 rounded-[4px]"
                        style={{ background: 'var(--amber-bg)', color: 'var(--amber)', border: '1px solid rgba(245,158,11,0.25)' }}>
                        Nuevo
                      </span>
                    )}
                  </div>
                  {/* Action buttons */}
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => mark(m.id, 'present')}
                      className="w-10 h-10 rounded-[9px] flex items-center justify-center press-sm"
                      style={{ background: st === 'present' ? 'var(--green-bg)' : 'var(--card)', border: `1px solid ${st === 'present' ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`, color: st === 'present' ? 'var(--green)' : 'var(--text-2)' }}>
                      <CheckCircle size={20} weight={st === 'present' ? 'fill' : 'regular'} />
                    </button>
                    <button
                      onClick={() => mark(m.id, 'late')}
                      className="w-10 h-10 rounded-[9px] flex items-center justify-center press-sm"
                      style={{ background: st === 'late' ? 'var(--amber-bg)' : 'var(--card)', border: `1px solid ${st === 'late' ? 'rgba(245,158,11,0.3)' : 'var(--border)'}`, color: st === 'late' ? 'var(--amber)' : 'var(--text-2)' }}>
                      <Clock size={20} weight={st === 'late' ? 'fill' : 'regular'} />
                    </button>
                    <button
                      onClick={() => mark(m.id, 'absent')}
                      className="w-10 h-10 rounded-[9px] flex items-center justify-center press-sm"
                      style={{ background: st === 'absent' ? 'var(--red-bg)' : 'var(--card)', border: `1px solid ${st === 'absent' ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`, color: st === 'absent' ? 'var(--red)' : 'var(--text-2)' }}>
                      <XCircle size={20} weight={st === 'absent' ? 'fill' : 'regular'} />
                    </button>
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* Bottom counter + save */}
      <div className="fixed bottom-[64px] left-0 right-0 z-20 flex items-center gap-3 px-4 py-3"
        style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)', paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <div className="flex gap-5 flex-shrink-0">
          <div className="flex flex-col items-center gap-0.5">
            <span className="font-syne font-extrabold text-2xl" style={{ color: 'var(--green)' }}>{counts.present}</span>
            <span className="text-[10px] font-bold uppercase tracking-[0.8px]" style={{ color: 'var(--text-2)' }}>Presentes</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <span className="font-syne font-extrabold text-2xl" style={{ color: 'var(--amber)' }}>{counts.late}</span>
            <span className="text-[10px] font-bold uppercase tracking-[0.8px]" style={{ color: 'var(--text-2)' }}>Tard.</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <span className="font-syne font-extrabold text-2xl" style={{ color: 'var(--red)' }}>{counts.absent}</span>
            <span className="text-[10px] font-bold uppercase tracking-[0.8px]" style={{ color: 'var(--text-2)' }}>Ausentes</span>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !selGroup}
          className="flex-1 flex items-center justify-center gap-2 h-12 rounded-[12px] font-bold text-sm press"
          style={{ background: 'var(--accent-g)', color: 'white', boxShadow: '0 4px 16px rgba(59,130,246,0.25)' }}>
          {saving
            ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin-slow" />
            : <><FloppyDisk size={18} /> Guardar</>
          }
        </button>
      </div>
    </div>
  )
}
