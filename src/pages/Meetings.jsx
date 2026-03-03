import { useState, useEffect, useMemo } from 'react'
import { usePersistedState } from '../hooks/usePersistedState'
import { collection, getDocs, doc, deleteDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import Modal from '../components/ui/Modal'
import { CalendarBlank, CheckCircle, XCircle, Trash } from '@phosphor-icons/react'
import { formatDateShort } from '../utils/dates'
import { memberInAnyGroup, memberInGroup } from '../utils/members'

export default function Meetings() {
  const { profile } = useAuth()
  const { ok, error: toastError } = useToast()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'

  const [records,   setRecords]   = useState([])
  const [members,   setMembers]   = useState([])
  const [groups,    setGroups]    = useState([])
  const [loading,   setLoading]   = useState(true)
  const [selGroup,  setSelGroup]  = usePersistedState('meet_group', '')
  const [selRecord, setSelRecord] = useState(null)

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
      }

      recs.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      setRecords(recs)
      setMembers(mems)
      setGroups(grps)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const filtered = useMemo(() => {
    if (!selGroup) return records
    return records.filter(r => r.groupId === selGroup)
  }, [records, selGroup])

  const groupMembersFor = (groupId) =>
    groupId ? members.filter(m => memberInGroup(m, groupId)) : members

  const groupName = (id) => groups.find(g => g.id === id)?.name || 'General'

  return (
    <div className="flex flex-col" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <h1 className="font-syne font-extrabold text-[17px]" style={{ color: 'var(--text)' }}>Reuniones</h1>
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

      {/* List */}
      <div className="px-4 py-4 flex flex-col gap-3">
        {loading ? <LoadingSpinner /> : filtered.length === 0 ? (
          <EmptyState icon={CalendarBlank} title="Sin reuniones" description="Aún no hay registros de asistencia guardados." />
        ) : (
          <>
            <p className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-2)' }}>
              {filtered.length} reunión{filtered.length !== 1 ? 'es' : ''}
            </p>
            {filtered.map(r => {
              const grpMems = groupMembersFor(r.groupId)
              // Use recorded IDs filtered by joinDate as source of truth for total
              // This avoids counting members added to the group after this meeting
              const recordedIds = Object.keys(r.records || {})
              const eligibleRecorded = recordedIds.filter(id => {
                const m = members.find(mm => mm.id === id)
                return !m?.joinDate || m.joinDate <= r.date
              })
              const total   = eligibleRecorded.length || grpMems.filter(m => !m.joinDate || m.joinDate <= r.date).length
              const present = Object.values(r.records || {}).filter(v => v === 'present').length
              const late    = Object.values(r.records || {}).filter(v => v === 'late').length
              const pct     = total > 0 ? Math.round(((present + late) / total) * 100) : 0
              const color   = pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--amber)' : 'var(--red)'
              return (
                <button key={r.id}
                  onClick={() => setSelRecord({ record: r, grpMems, grpName: groupName(r.groupId) })}
                  className="flex items-center gap-4 px-4 py-3 rounded-[12px] w-full text-left press"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>{formatDateShort(r.date)}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>
                      {present + late} de {total} asistieron
                      {r.groupId && <span style={{ color: 'var(--text-3)' }}> · {groupName(r.groupId)}</span>}
                    </p>
                  </div>
                  <span className="font-syne font-extrabold text-xl flex-shrink-0" style={{ color }}>{pct}%</span>
                </button>
              )
            })}
          </>
        )}
      </div>

      {/* Meeting detail modal */}
      {selRecord && (
        <MeetingDetail
          record={selRecord.record}
          members={selRecord.grpMems}
          groupName={selRecord.grpName}
          allMembers={members}
          onClose={() => setSelRecord(null)}
          onDelete={isAdmin ? async () => {
            if (!window.confirm('¿Eliminar esta reunión? Esta acción no se puede deshacer.')) return
            try {
              await deleteDoc(doc(db, 'attendance', selRecord.record.id))
              ok('Reunión eliminada')
              setSelRecord(null)
              loadData()
            } catch { toastError('Error al eliminar') }
          } : null}
        />
      )}
    </div>
  )
}

function MeetingDetail({ record, members, groupName, allMembers, onClose, onDelete }) {
  const recs = record.records || {}
  // Only consider records for members who had joined by this meeting's date
  const eligibleEntries = Object.entries(recs).filter(([id]) => {
    const m = allMembers.find(mm => mm.id === id)
    return !m?.joinDate || m.joinDate <= record.date
  })
  const presentIds = eligibleEntries.filter(([, v]) => v === 'present' || v === 'late').map(([k]) => k)
  const absentIds  = eligibleEntries.filter(([, v]) => v === 'absent').map(([k]) => k)

  const totalAttended = presentIds.length
  const total = eligibleEntries.length || members.filter(m => !m.joinDate || m.joinDate <= record.date).length
  const pct   = total > 0 ? Math.round((totalAttended / total) * 100) : 0
  const color = pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--amber)' : 'var(--red)'

  function getName(id) {
    return allMembers.find(m => m.id === id)?.fullName || 'Persona externa'
  }

  function Section({ title, ids, icon: Icon, colorVal }) {
    if (!ids.length) return null
    return (
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: colorVal }}>
          {title} ({ids.length})
        </p>
        <div className="flex flex-col gap-1">
          {ids.map(id => (
            <div key={id} className="flex items-center gap-2.5 px-3 py-2 rounded-[9px]"
              style={{ background: 'var(--card)' }}>
              <Icon size={14} weight="fill" style={{ color: colorVal, flexShrink: 0 }} />
              <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{getName(id)}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <Modal open onClose={onClose} title={formatDateShort(record.date)}>
      <div className="flex flex-col gap-4">
        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Presentes', value: presentIds.length, color: 'var(--green)' },
            { label: 'Ausentes',  value: absentIds.length,  color: 'var(--red)' },
          ].map(s => (
            <div key={s.label} className="flex flex-col items-center gap-1 p-3 rounded-[10px]"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
              <span className="font-syne font-extrabold text-xl" style={{ color: s.color }}>{s.value}</span>
              <span className="text-[10px] font-bold uppercase tracking-wide text-center" style={{ color: 'var(--text-2)' }}>{s.label}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between px-1">
          <p className="text-xs" style={{ color: 'var(--text-2)' }}>{groupName} · {total} miembros</p>
          <span className="font-syne font-extrabold text-2xl" style={{ color }}>{pct}%</span>
        </div>

        <Section title="Presentes" ids={presentIds} icon={CheckCircle} colorVal="var(--green)" />
        <Section title="Ausentes"  ids={absentIds}  icon={XCircle}      colorVal="var(--red)" />

        {onDelete && (
          <button
            onClick={onDelete}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-[10px] text-sm font-bold press"
            style={{ background: 'var(--red-bg)', border: '1px solid var(--red-bdr)', color: 'var(--red)' }}>
            <Trash size={15} weight="bold" />
            Eliminar reunión
          </button>
        )}
      </div>
    </Modal>
  )
}
