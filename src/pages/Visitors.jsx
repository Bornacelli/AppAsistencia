import { useState, useEffect, useMemo } from 'react'
import { collection, getDocs, doc, addDoc, updateDoc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../context/ToastContext'
import Modal from '../components/ui/Modal'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import { Inp, Sel, Textarea } from '../components/ui/Inp'
import { Handshake, Plus, Phone, ArrowRight, NotePencil, UserPlus } from '@phosphor-icons/react'
import { todayStr, formatDateShort, localDateStr } from '../utils/dates'

const STATUS_LABEL = { visitor: 'Visitante', following: 'En seguimiento', converted: 'Consolidado' }
const STATUS_COLOR = { visitor: 'var(--accent)', following: 'var(--amber)', converted: 'var(--green)' }

export default function Visitors() {
  const { profile } = useAuth()
  const navigate    = useNavigate()
  const { ok, error: toastError } = useToast()
  const isAdmin = profile?.role === 'admin'

  const [visitors,  setVisitors]  = useState([])
  const [groups,    setGroups]    = useState([])
  const [loading,   setLoading]   = useState(true)
  const [filter,    setFilter]    = useState('active') // 'active' | 'all'
  const [modal,     setModal]     = useState(null)     // null | 'add' | 'note' | 'view'
  const [selVisitor,setSelVisitor]= useState(null)
  const [saving,    setSaving]    = useState(false)

  // Add visitor form
  const [vForm, setVForm] = useState({ name: '', phone: '', referredBy: '', firstVisitDate: todayStr(), groupId: profile?.groupIds?.[0] || '' })
  const setV = (k, v) => setVForm(f => ({ ...f, [k]: v }))

  // Note form
  const [noteText, setNoteText] = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [vSnap, gSnap] = await Promise.all([
        getDocs(collection(db, 'visitors')),
        getDocs(collection(db, 'groups')),
      ])
      let vs = vSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      if (!isAdmin) {
        const gids = profile?.groupIds || []
        vs = vs.filter(v => gids.includes(v.groupId))
      }
      vs.sort((a, b) => (b.firstVisitDate || '').localeCompare(a.firstVisitDate || ''))
      setVisitors(vs)
      setGroups(gSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const filtered = useMemo(() => {
    if (filter === 'active') return visitors.filter(v => v.status !== 'converted')
    return visitors
  }, [visitors, filter])

  async function handleAddVisitor(e) {
    e.preventDefault()
    if (!vForm.name.trim()) { toastError('El nombre es requerido'); return }
    setSaving(true)
    try {
      const data = {
        name: vForm.name.trim(),
        phone: vForm.phone.trim() || null,
        referredBy: vForm.referredBy.trim() || null,
        firstVisitDate: vForm.firstVisitDate || todayStr(),
        status: 'visitor',
        groupId: vForm.groupId || null,
        notes: [],
        createdAt: new Date().toISOString(),
      }
      const ref = await addDoc(collection(db, 'visitors'), data)
      setVisitors(prev => [{ id: ref.id, ...data }, ...prev])
      setModal(null)
      setVForm({ name: '', phone: '', referredBy: '', firstVisitDate: todayStr(), groupId: profile?.groupIds?.[0] || '' })
      ok(`${data.name} registrado como visitante`)
    } catch { toastError('Error al guardar') }
    finally { setSaving(false) }
  }

  async function handleAddNote(e) {
    e.preventDefault()
    if (!noteText.trim()) { toastError('Escribe una nota'); return }
    setSaving(true)
    try {
      const note = { date: todayStr(), text: noteText.trim(), leaderId: profile.uid }
      const newNotes = [...(selVisitor.notes || []), note]
      await updateDoc(doc(db, 'visitors', selVisitor.id), { notes: newNotes, status: selVisitor.status === 'visitor' ? 'following' : selVisitor.status })
      setVisitors(prev => prev.map(v => v.id === selVisitor.id ? { ...v, notes: newNotes, status: selVisitor.status === 'visitor' ? 'following' : selVisitor.status } : v))
      setSelVisitor(prev => ({ ...prev, notes: newNotes }))
      setNoteText('')
      ok('Nota agregada')
    } catch { toastError('Error al guardar') }
    finally { setSaving(false) }
  }

  async function handleConvert(visitor) {
    if (!window.confirm(`¿Convertir a ${visitor.name} en miembro?`)) return
    // Navigate to member form with pre-filled data
    navigate('/members/new', { state: { fromVisitor: visitor } })
  }

  async function handleChangeStatus(visitor, newStatus) {
    try {
      await updateDoc(doc(db, 'visitors', visitor.id), { status: newStatus })
      setVisitors(prev => prev.map(v => v.id === visitor.id ? { ...v, status: newStatus } : v))
      if (selVisitor?.id === visitor.id) setSelVisitor(prev => ({ ...prev, status: newStatus }))
      ok('Estado actualizado')
    } catch { toastError('Error') }
  }

  const sevenDaysAgo = localDateStr(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))

  function getFollowUpColor(visitor) {
    const notes = visitor.notes || []
    if (!notes.length) return 'var(--red)'
    const last = notes[notes.length - 1].date
    if (last >= sevenDaysAgo) return 'var(--green)'
    return 'var(--amber)'
  }

  return (
    <div className="flex flex-col" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <h1 className="font-syne font-extrabold text-[17px]" style={{ color: 'var(--text)' }}>Visitantes</h1>
        <button onClick={() => setModal('add')}
          className="h-9 px-4 flex items-center gap-1.5 rounded-[10px] text-sm font-bold press"
          style={{ background: 'var(--accent-g)', color: 'white' }}>
          <Plus size={16} weight="bold" /> Nuevo
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex px-4 pt-3 pb-2 gap-2">
        {[['active', 'Activos'], ['all', 'Todos']].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)}
            className="px-4 py-1.5 rounded-full text-xs font-bold press"
            style={{ background: filter === v ? 'rgba(59,130,246,0.15)' : 'var(--surface)', color: filter === v ? 'var(--accent)' : 'var(--text-2)', border: `1px solid ${filter === v ? 'rgba(59,130,246,0.3)' : 'var(--border)'}` }}>
            {l}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="px-4 pb-4">
        {loading ? <LoadingSpinner /> : filtered.length === 0 ? (
          <EmptyState icon={Handshake} title="Sin visitantes" description="Registra el primer visitante con el botón de arriba." />
        ) : (
          <>
            <p className="text-[11px] font-bold uppercase tracking-widest py-2" style={{ color: 'var(--text-2)' }}>
              {filtered.length} visitante{filtered.length !== 1 ? 's' : ''}
            </p>
            {filtered.map(v => (
              <button
                key={v.id}
                onClick={() => { setSelVisitor(v); setModal('view') }}
                className="flex items-center gap-3 rounded-[10px] px-3 py-3 mb-2 w-full text-left press"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                {/* Follow-up indicator */}
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5"
                  style={{ background: v.status === 'converted' ? 'var(--green)' : getFollowUpColor(v) }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: 'var(--text)' }}>{v.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] font-bold" style={{ color: STATUS_COLOR[v.status] || 'var(--text-2)' }}>
                      {STATUS_LABEL[v.status] || v.status}
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                      · {(v.notes || []).length} nota{(v.notes || []).length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                <ArrowRight size={16} style={{ color: 'var(--text-3)' }} />
              </button>
            ))}
          </>
        )}
      </div>

      {/* Add visitor modal */}
      <Modal open={modal === 'add'} onClose={() => setModal(null)} title="Nuevo visitante">
        <form onSubmit={handleAddVisitor} className="flex flex-col gap-4">
          <Inp label="Nombre *" value={vForm.name} onChange={e => setV('name', e.target.value)} placeholder="María García" autoCapitalize="words" />
          <Inp label="WhatsApp" type="tel" value={vForm.phone} onChange={e => setV('phone', e.target.value)} placeholder="+57 300 000 0000" />
          <Inp label="Referido por" value={vForm.referredBy} onChange={e => setV('referredBy', e.target.value)} placeholder="Nombre del miembro que lo invitó" />
          <Inp label="Primera visita" type="date" value={vForm.firstVisitDate} onChange={e => setV('firstVisitDate', e.target.value)} style={{ colorScheme: 'dark' }} />
          {groups.length > 0 && (
            <Sel label="Grupo" value={vForm.groupId} onChange={e => setV('groupId', e.target.value)}>
              <option value="">Sin grupo</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Sel>
          )}
          <button type="submit" disabled={saving}
            className="h-12 rounded-[12px] font-bold text-sm flex items-center justify-center gap-2 press"
            style={{ background: 'var(--accent-g)', color: 'white' }}>
            {saving ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin-slow" /> : 'Registrar visitante'}
          </button>
        </form>
      </Modal>

      {/* View visitor modal */}
      {selVisitor && (
        <Modal open={modal === 'view'} onClose={() => { setModal(null); setSelVisitor(null) }} title={selVisitor.name}>
          <div className="flex flex-col gap-4">
            {/* Status + actions */}
            <div className="flex items-center gap-2 flex-wrap">
              {['visitor', 'following', 'converted'].map(s => (
                <button key={s} onClick={() => handleChangeStatus(selVisitor, s)}
                  className="px-3 py-1.5 rounded-full text-xs font-bold press"
                  style={{ background: selVisitor.status === s ? STATUS_COLOR[s] + '25' : 'var(--surface)', color: selVisitor.status === s ? STATUS_COLOR[s] : 'var(--text-2)', border: `1px solid ${selVisitor.status === s ? STATUS_COLOR[s] + '60' : 'var(--border)'}` }}>
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>

            {/* Info */}
            <div className="flex flex-col gap-2 text-sm">
              {selVisitor.phone && <div className="flex items-center gap-2" style={{ color: 'var(--text-2)' }}>
                <Phone size={14} />
                <a href={`https://wa.me/${selVisitor.phone.replace(/\D/g,'')}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{selVisitor.phone}</a>
              </div>}
              {selVisitor.referredBy && <p style={{ color: 'var(--text-2)' }}>Referido por: <span style={{ color: 'var(--text)' }}>{selVisitor.referredBy}</span></p>}
              {selVisitor.firstVisitDate && <p style={{ color: 'var(--text-2)' }}>Primera visita: <span style={{ color: 'var(--text)' }}>{formatDateShort(selVisitor.firstVisitDate)}</span></p>}
            </div>

            {/* Notes */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-2)' }}>Seguimiento</p>
              {(selVisitor.notes || []).length === 0
                ? <p className="text-xs" style={{ color: 'var(--text-3)' }}>Sin notas aún</p>
                : (selVisitor.notes || []).slice().reverse().map((n, i) => (
                  <div key={i} className="mb-2 p-3 rounded-[10px]" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                    <p className="text-[10px] font-bold mb-1" style={{ color: 'var(--text-3)' }}>{n.date}</p>
                    <p className="text-sm" style={{ color: 'var(--text)' }}>{n.text}</p>
                  </div>
                ))
              }

              {/* Add note form */}
              <form onSubmit={handleAddNote} className="mt-3 flex flex-col gap-2">
                <Textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Escribe una nota de seguimiento..." rows={3} />
                <button type="submit" disabled={saving}
                  className="h-10 rounded-[10px] text-sm font-bold flex items-center justify-center gap-2 press"
                  style={{ background: 'rgba(59,130,246,0.15)', color: 'var(--accent)', border: '1px solid rgba(59,130,246,0.3)' }}>
                  <NotePencil size={16} /> Agregar nota
                </button>
              </form>
            </div>

            {/* Convert to member */}
            {selVisitor.status !== 'converted' && (
              <button onClick={() => handleConvert(selVisitor)}
                className="h-12 rounded-[12px] font-bold text-sm flex items-center justify-center gap-2 press"
                style={{ background: 'var(--green-bg)', color: 'var(--green)', border: '1px solid var(--green-bdr)' }}>
                <UserPlus size={18} /> Convertir en miembro
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
