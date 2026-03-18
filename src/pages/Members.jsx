import { useState, useEffect, useMemo, useRef } from 'react'
import { collection, getDocs, doc, addDoc, updateDoc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../context/ToastContext'
import Avatar from '../components/ui/Avatar'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import Modal from '../components/ui/Modal'
import { Inp, Sel, Textarea } from '../components/ui/Inp'
import {
  MagnifyingGlass, Plus, Users, FunnelSimple, ArrowRight,
  Phone, NotePencil, UserPlus, DownloadSimple, FileArrowUp, SpinnerGap
} from '@phosphor-icons/react'
import { generateMembersTemplate, parseMembersFromExcel } from '../utils/excel'
import { getAgeRange } from '../utils/members'
import { todayStr, formatDateShort, localDateStr } from '../utils/dates'

const SPIRITUAL_LABEL = {
  new:         'Nuevo',
  following:   'En seguimiento',
  consolidated:'Consolidado',
  member:      'Miembro',
  leader:      'Líder',
}
const SPIRITUAL_COLOR = {
  new:         'var(--amber)',
  following:   'var(--accent)',
  consolidated:'var(--green)',
  member:      '#10b981',
  leader:      '#a78bfa',
}

// Normalize a visitor doc to unified format
function normalizeVisitor(v) {
  return {
    _uid:    `v_${v.id}`,
    _source: 'visitor',
    _id:     v.id,
    _data:   v,
    fullName: v.name,
    phone:    v.phone || '',
    groupId:  v.groupId,
    spiritualStatus: v.status === 'following' ? 'following' : '',
    active: true,
  }
}

// Normalize a member doc to unified format
function normalizeMember(m) {
  return {
    _uid:    `m_${m.id}`,
    _source: 'member',
    _id:     m.id,
    _data:   m,
    fullName: m.fullName,
    phone:    m.phone || '',
    groupId:  m.groupId,
    spiritualStatus: m.spiritualStatus,
    active: m.active !== false,
  }
}

const STATUS_LABEL_VISITOR = {
  following: 'En seguimiento',
  converted: 'Consolidado',
}
const STATUS_COLOR_VISITOR = {
  following: 'var(--amber)',
  converted: 'var(--green)',
}

export default function Members() {
  const { profile } = useAuth()
  const navigate    = useNavigate()
  const { ok, error: toastError } = useToast()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'

  const [people,       setPeople]       = useState([])
  const [groups,       setGroups]       = useState([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [filterGroup,    setFilterGroup]    = useState('')
  const [filterStatus,   setFilterStatus]   = useState('')
  const [filterActive,   setFilterActive]   = useState('true')
  const [filterAgeRange, setFilterAgeRange] = useState('')
  const [filterSex,      setFilterSex]      = useState('')
  const [ageRanges,      setAgeRanges]      = useState([])
  const [showFilters,  setShowFilters]  = useState(false)

  // Import
  const fileInputRef = useRef(null)
  const [importing, setImporting] = useState(false)

  // Visitor detail modal state
  const [selVisitor, setSelVisitor] = useState(null)
  const [visModal,   setVisModal]   = useState(false)
  const [noteText,   setNoteText]   = useState('')
  const [saving,     setSaving]     = useState(false)

  useEffect(() => { loadData() }, [profile])

  async function loadData() {
    setLoading(true)
    try {
      const [mSnap, gSnap, vSnap, cfgSnap] = await Promise.all([
        getDocs(collection(db, 'members')),
        getDocs(collection(db, 'groups')),
        getDocs(collection(db, 'visitors')),
        getDoc(doc(db, 'config', 'general')),
      ])
      setAgeRanges(cfgSnap.exists() ? (cfgSnap.data().ageRanges || []) : [])

      let mems = mSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      let vis  = vSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(v => v.status !== 'converted') // converted ones are already in members

      if (!isAdmin) {
        const gids = profile?.groupIds || []
        mems = mems.filter(m => {
          const mGroupIds = m.groupIds?.length > 0 ? m.groupIds : (m.groupId ? [m.groupId] : [])
          return gids.some(gid => mGroupIds.includes(gid))
        })
        vis  = vis.filter(v => gids.includes(v.groupId))
      }

      const normalized = [
        ...mems.map(normalizeMember),
        ...vis.map(normalizeVisitor),
      ].sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', 'es'))

      setPeople(normalized)
      setGroups(gSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const filtered = useMemo(() => {
    return people.filter(p => {
      const q = search.toLowerCase()
      const matchSearch = !q ||
        (p.fullName || '').toLowerCase().includes(q) ||
        (p.phone || '').includes(q)
      const matchGroup    = !filterGroup    || p.groupId === filterGroup || (p._data?.groupIds || []).includes(filterGroup)
      const matchStatus   = !filterStatus   || p.spiritualStatus === filterStatus
      const matchActive   = filterActive === '' || String(p.active) === filterActive
      const matchSex      = !filterSex      || p._data?.sex === filterSex
      const matchAgeRange = !filterAgeRange || getAgeRange(p._data?.birthDate, ageRanges)?.name === filterAgeRange
      return matchSearch && matchGroup && matchStatus && matchActive && matchSex && matchAgeRange
    })
  }, [people, search, filterGroup, filterStatus, filterActive, filterSex, filterAgeRange, ageRanges])

  const groupName = (id) => groups.find(g => g.id === id)?.name || ''

  function handlePersonClick(p) {
    if (p._source === 'member') {
      navigate(`/members/${p._id}`)
    } else {
      setSelVisitor(p._data)
      setVisModal(true)
    }
  }

  // Visitor modal actions
  async function handleAddNote(e) {
    e.preventDefault()
    if (!noteText.trim()) { toastError('Escribe una nota'); return }
    setSaving(true)
    try {
      const note = { date: todayStr(), text: noteText.trim(), leaderId: profile.uid }
      const newNotes = [...(selVisitor.notes || []), note]
      const newStatus = selVisitor.status === 'visitor' ? 'following' : selVisitor.status
      await updateDoc(doc(db, 'visitors', selVisitor.id), { notes: newNotes, status: newStatus })
      const updatedVisitor = { ...selVisitor, notes: newNotes, status: newStatus }
      setSelVisitor(updatedVisitor)
      setPeople(prev => prev.map(p =>
        p._source === 'visitor' && p._id === selVisitor.id
          ? { ...p, _data: updatedVisitor, spiritualStatus: newStatus === 'following' ? 'following' : 'visitor' }
          : p
      ))
      setNoteText('')
      ok('Nota agregada')
    } catch { toastError('Error al guardar') }
    finally { setSaving(false) }
  }

  async function handleChangeStatus(newStatus) {
    try {
      await updateDoc(doc(db, 'visitors', selVisitor.id), { status: newStatus })
      const updatedVisitor = { ...selVisitor, status: newStatus }
      setSelVisitor(updatedVisitor)
      setPeople(prev => prev.map(p =>
        p._source === 'visitor' && p._id === selVisitor.id
          ? { ...p, _data: updatedVisitor, spiritualStatus: newStatus === 'following' ? 'following' : 'visitor' }
          : p
      ))
      ok('Estado actualizado')
    } catch { toastError('Error') }
  }

  function handleConvertToMember() {
    if (!window.confirm(`¿Convertir a ${selVisitor.name} en miembro oficial?`)) return
    setVisModal(false)
    navigate('/members/new', { state: { fromVisitor: selVisitor } })
  }

  async function handleImport(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImporting(true)
    try {
      const members = await parseMembersFromExcel(file, groups)
      if (members.length === 0) {
        toastError('No se encontraron filas válidas en el archivo')
        return
      }
      for (const member of members) {
        await addDoc(collection(db, 'members'), member)
      }
      ok(`${members.length} persona${members.length !== 1 ? 's' : ''} importada${members.length !== 1 ? 's' : ''}`)
      loadData()
    } catch (err) {
      console.error(err)
      toastError('Error al leer el archivo')
    } finally {
      setImporting(false)
    }
  }

  const sevenDaysAgo = localDateStr(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
  function followUpColor(visitor) {
    const notes = visitor.notes || []
    if (!notes.length) return 'var(--red)'
    return notes[notes.length - 1].date >= sevenDaysAgo ? 'var(--green)' : 'var(--amber)'
  }

  return (
    <div className="flex flex-col" style={{ background: 'var(--bg)', minHeight: '100%' }}> 
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <h1 className="font-syne font-extrabold text-[17px]" style={{ color: 'var(--text)' }}>Personas</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="w-9 h-9 flex items-center justify-center rounded-[10px] press"
            style={{ background: showFilters ? 'rgba(59,130,246,0.15)' : 'var(--card)', border: `1px solid ${showFilters ? 'rgba(59,130,246,0.3)' : 'var(--border)'}`, color: showFilters ? 'var(--accent)' : 'var(--text-2)' }}>
            <FunnelSimple size={18} />
          </button>
          <button
            onClick={() => navigate('/members/new')}
            className="h-9 px-4 flex items-center gap-1.5 rounded-[10px] text-sm font-bold press"
            style={{ background: 'var(--accent-g)', color: 'white' }}>
            <Plus size={16} weight="bold" />
            Nuevo
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 rounded-[12px] px-4"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          onFocusCapture={e => e.currentTarget.style.borderColor = 'var(--accent)'}
          onBlurCapture={e  => e.currentTarget.style.borderColor = 'var(--border)'}>
          <MagnifyingGlass size={18} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre o teléfono..."
            className="flex-1 bg-transparent py-3 text-sm font-medium outline-none"
            style={{ color: 'var(--text)', fontFamily: 'inherit' }}
          />
        </div>
      </div>

      {/* Import actions — admin only */}
      {isAdmin && (
        <div className="px-4 pb-2 flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleImport}
          />
          <button
            onClick={() => generateMembersTemplate(groups)}
            className="flex-1 h-9 flex items-center justify-center gap-1.5 rounded-[10px] text-xs font-bold press"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
            <DownloadSimple size={15} />
            Descargar plantilla
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex-1 h-9 flex items-center justify-center gap-1.5 rounded-[10px] text-xs font-bold press"
            style={{ background: importing ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)', color: 'var(--accent)' }}>
            {importing
              ? <SpinnerGap size={15} className="animate-spin" />
              : <FileArrowUp size={15} />}
            {importing ? 'Importando...' : 'Importar Excel'}
          </button>
        </div>
      )}

      {/* Filters */}
      {showFilters && (
        <div className="px-4 pb-3 flex flex-col gap-2 animate-slide-up">
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: filterGroup,  setter: setFilterGroup,  opts: [['', 'Todos los grupos'], ...groups.map(g => [g.id, g.name])] },
              { value: filterStatus, setter: setFilterStatus, opts: [['','Todos'], ['new','Nuevo'], ['following','Seguimiento'], ['consolidated','Consolidado'], ['member','Miembro'], ['leader','Líder']] },
              { value: filterActive, setter: setFilterActive, opts: [['true','Activos'], ['false','Inactivos'], ['','Todos']] },
            ].map((f, i) => (
              <select key={i} value={f.value} onChange={e => f.setter(e.target.value)}
                className="rounded-[9px] px-3 py-2 text-xs font-medium outline-none"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit' }}>
                {f.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select value={filterSex} onChange={e => setFilterSex(e.target.value)}
              className="rounded-[9px] px-3 py-2 text-xs font-medium outline-none"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit' }}>
              <option value="">Todos los sexos</option>
              <option value="male">Masculino</option>
              <option value="female">Femenino</option>
            </select>
            <select value={filterAgeRange} onChange={e => setFilterAgeRange(e.target.value)}
              className="rounded-[9px] px-3 py-2 text-xs font-medium outline-none"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit' }}>
              <option value="">Todos los rangos</option>
              {ageRanges.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* List */}
      <div className="px-4 pb-4">
        {loading ? (
          <LoadingSpinner />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Users} title="Sin personas" description="Agrega la primera persona con el botón de arriba." />
        ) : (
          <>
            <p className="text-[11px] font-bold uppercase tracking-widest py-2" style={{ color: 'var(--text-2)' }}>
              {filtered.length} persona{filtered.length !== 1 ? 's' : ''}
            </p>
            {filtered.map(p => (
              <button
                key={p._uid}
                onClick={() => handlePersonClick(p)}
                className="flex items-center gap-3 rounded-[10px] px-3 py-3 mb-2 w-full text-left press"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', opacity: p.active === false ? 0.5 : 1 }}>
                {/* Visitor: show follow-up dot; Member: Avatar */}
                {p._source === 'visitor' ? (
                  <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: 'var(--card)', border: `2px solid ${followUpColor(p._data)}` }}>
                    <span className="text-base font-bold" style={{ color: 'var(--text)' }}>
                      {(p.fullName || '?').charAt(0).toUpperCase()}
                    </span>
                  </div>
                ) : (
                  <Avatar name={p.fullName} size={44} />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: 'var(--text)' }}>{p.fullName?.toUpperCase()}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {p.spiritualStatus && (
                      <span className="text-[10px] font-bold"
                        style={{ color: SPIRITUAL_COLOR[p.spiritualStatus] || 'var(--text-2)' }}>
                        {SPIRITUAL_LABEL[p.spiritualStatus] || p.spiritualStatus}
                      </span>
                    )}
                    {p._data?.sex && (
                      <span className="text-[10px] font-bold"
                        style={{ color: p._data.sex === 'male' ? 'var(--accent)' : '#ec4899' }}>
                        {p._data.sex === 'male' ? 'Masc' : 'Fem'}
                      </span>
                    )}
                    {(() => { const r = getAgeRange(p._data?.birthDate, ageRanges); return r ? (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-[4px]"
                        style={{ background: 'rgba(139,92,246,0.1)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.2)' }}>
                        {r.name}
                      </span>
                    ) : null })()}
                    {p._source === 'visitor' && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-[4px]"
                        style={{ background: 'rgba(59,130,246,0.1)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>
                        visitante
                      </span>
                    )}
                    {p.groupId && groupName(p.groupId) && (
                      <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>· {groupName(p.groupId)}</span>
                    )}
                  </div>
                </div>
                <ArrowRight size={16} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
              </button>
            ))}
          </>
        )}
      </div>

      {/* Visitor detail modal */}
      {selVisitor && (
        <Modal open={visModal} onClose={() => { setVisModal(false); setSelVisitor(null); setNoteText('') }} title={selVisitor.name}>
          <div className="flex flex-col gap-4">
            {/* Status chips */}
            <div className="flex items-center gap-2 flex-wrap">
              {['visitor', 'following', 'converted'].map(s => (
                <button key={s} onClick={() => handleChangeStatus(s)}
                  className="px-3 py-1.5 rounded-full text-xs font-bold press"
                  style={{
                    background: selVisitor.status === s ? STATUS_COLOR_VISITOR[s] + '25' : 'var(--surface)',
                    color: selVisitor.status === s ? STATUS_COLOR_VISITOR[s] : 'var(--text-2)',
                    border: `1px solid ${selVisitor.status === s ? STATUS_COLOR_VISITOR[s] + '60' : 'var(--border)'}`
                  }}>
                  {STATUS_LABEL_VISITOR[s]}
                </button>
              ))}
            </div>

            {/* Info */}
            <div className="flex flex-col gap-2 text-sm">
              {selVisitor.phone && (
                <div className="flex items-center gap-2" style={{ color: 'var(--text-2)' }}>
                  <Phone size={14} />
                  <a href={`https://wa.me/${selVisitor.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                    style={{ color: 'var(--accent)' }}>{selVisitor.phone}</a>
                </div>
              )}
              {selVisitor.referredBy && (
                <p style={{ color: 'var(--text-2)' }}>
                  Referido por: <span style={{ color: 'var(--text)' }}>{selVisitor.referredBy}</span>
                </p>
              )}
              {selVisitor.firstVisitDate && (
                <p style={{ color: 'var(--text-2)' }}>
                  Primera visita: <span style={{ color: 'var(--text)' }}>{formatDateShort(selVisitor.firstVisitDate)}</span>
                </p>
              )}
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
              <form onSubmit={handleAddNote} className="mt-3 flex flex-col gap-2">
                <Textarea value={noteText} onChange={e => setNoteText(e.target.value)}
                  placeholder="Escribe una nota de seguimiento..." rows={3} />
                <button type="submit" disabled={saving}
                  className="h-10 rounded-[10px] text-sm font-bold flex items-center justify-center gap-2 press"
                  style={{ background: 'rgba(59,130,246,0.15)', color: 'var(--accent)', border: '1px solid rgba(59,130,246,0.3)' }}>
                  <NotePencil size={16} /> Agregar nota
                </button>
              </form>
            </div>

            {/* Convert to member */}
            {selVisitor.status !== 'converted' && (
              <button onClick={handleConvertToMember}
                className="h-12 rounded-[12px] font-bold text-sm flex items-center justify-center gap-2 press"
                style={{ background: 'var(--green-bg)', color: 'var(--green)', border: '1px solid var(--green-bdr)' }}>
                <UserPlus size={18} /> Registrar como miembro
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
