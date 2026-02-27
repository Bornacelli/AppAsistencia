import { useState, useEffect, useRef, useMemo } from 'react'
import { collection, getDocs, doc, getDoc, addDoc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useToast } from '../context/ToastContext'
import TopBar from '../components/layout/TopBar'
import { Inp, Sel } from '../components/ui/Inp'
import { Check, X } from '@phosphor-icons/react'
import { todayStr } from '../utils/dates'
import { getMemberGroupIds } from '../utils/members'

// Combobox para seleccionar el miembro que invitó
function MemberCombobox({ label, members, selectedId, legacyText, onSelect, excludeId }) {
  const [query, setQuery]   = useState('')
  const [open, setOpen]     = useState(false)
  const containerRef        = useRef(null)

  const selectedMember = members.find(m => m.id === selectedId) || null

  const filtered = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    return members
      .filter(m => m.id !== excludeId && (
        m.fullName.toLowerCase().includes(q) ||
        (m.shortName || '').toLowerCase().includes(q)
      ))
      .slice(0, 8)
  }, [query, members, excludeId])

  useEffect(() => {
    function onClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function handleSelect(member) {
    onSelect(member.id, member.fullName)
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <p className="text-xs font-bold uppercase tracking-widest mb-1.5"
        style={{ color: 'var(--text-2)' }}>{label}</p>

      {selectedMember ? (
        // Miembro seleccionado — mostrar nombre con botón para limpiar
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-[10px]"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <span className="flex-1 text-sm font-medium" style={{ color: 'var(--text)' }}>
            {selectedMember.fullName}
            {selectedMember.shortName && (
              <span className="ml-1.5 text-xs" style={{ color: 'var(--text-2)' }}>
                ({selectedMember.shortName})
              </span>
            )}
          </span>
          <button type="button" onClick={() => onSelect(null, null)}
            className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--text-3)' }}>
            <X size={10} weight="bold" color="white" />
          </button>
        </div>
      ) : (
        // Sin selección — mostrar buscador
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            placeholder="Buscar por nombre..."
            className="w-full px-3 py-2.5 text-sm font-medium rounded-[10px] outline-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit' }}
          />

          {open && query.trim() && (
            <div className="absolute top-full left-0 right-0 mt-1 rounded-[12px] overflow-hidden z-50"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
              {filtered.length > 0 ? filtered.map((m, i) => (
                <button
                  key={m.id}
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => handleSelect(m)}
                  className="w-full text-left px-4 py-3 text-sm font-medium press"
                  style={{
                    color: 'var(--text)',
                    borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                  }}>
                  {m.fullName}
                  {m.shortName && (
                    <span className="ml-1.5 text-xs" style={{ color: 'var(--text-2)' }}>({m.shortName})</span>
                  )}
                </button>
              )) : (
                <p className="px-4 py-3 text-sm" style={{ color: 'var(--text-2)' }}>Sin resultados</p>
              )}
            </div>
          )}

          {/* Valor legacy (texto libre guardado antes de esta mejora) */}
          {legacyText && !query && (
            <p className="mt-1.5 text-xs" style={{ color: 'var(--text-3)' }}>
              Valor anterior: <span style={{ color: 'var(--text-2)' }}>{legacyText}</span> — busca y selecciona para actualizar
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default function MemberForm() {
  const { id } = useParams()
  const isEdit = !!id
  const { profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { ok, error: toastError } = useToast()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'

  const fromVisitor = location.state?.fromVisitor

  const [groups,  setGroups]  = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(isEdit)
  const [saving,  setSaving]  = useState(false)
  const [errors,  setErrors]  = useState({})

  const [form, setForm] = useState({
    fullName:        fromVisitor?.name  || '',
    shortName:       '',
    birthDate:       '',
    phone:           fromVisitor?.phone || '',
    address:         '',
    joinDate:        todayStr(),
    spiritualStatus: 'new',
    groupIds:        fromVisitor?.groupId ? [fromVisitor.groupId] : (profile?.groupIds || []),
    referredById:    '',   // ID del miembro que lo invitó
    referredBy:      fromVisitor?.referredBy || '',  // nombre (legado y compatibilidad)
    active:          true,
  })

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  function setReferredBy(memberId, memberName) {
    setForm(f => ({
      ...f,
      referredById: memberId || '',
      referredBy:   memberName || '',
    }))
  }

  function toggleGroup(gid) {
    setForm(f => ({
      ...f,
      groupIds: f.groupIds.includes(gid)
        ? f.groupIds.filter(i => i !== gid)
        : [...f.groupIds, gid],
    }))
  }

  useEffect(() => {
    loadGroups()
    loadMembers()
    if (isEdit) loadMember()
  }, [])

  async function loadGroups() {
    try {
      const snap = await getDocs(collection(db, 'groups'))
      let grps = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(g => g.active !== false)
      if (!isAdmin) grps = grps.filter(g => (profile?.groupIds || []).includes(g.id))
      setGroups(grps)
    } catch {}
  }

  async function loadMembers() {
    try {
      const snap = await getDocs(collection(db, 'members'))
      const active = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(m => m.active !== false)
        .sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''))
      setMembers(active)
    } catch {}
  }

  async function loadMember() {
    try {
      const snap = await getDoc(doc(db, 'members', id))
      if (snap.exists()) {
        const d = snap.data()
        setForm({
          fullName:        d.fullName        || '',
          shortName:       d.shortName       || '',
          birthDate:       d.birthDate       || '',
          phone:           d.phone           || '',
          address:         d.address         || '',
          joinDate:        d.joinDate        || '',
          spiritualStatus: d.spiritualStatus || 'new',
          groupIds:        getMemberGroupIds(d),
          referredById:    d.referredById    || '',
          referredBy:      d.referredBy      || '',
          active:          d.active !== false,
        })
      }
    } catch { toastError('Error al cargar el miembro') }
    finally { setLoading(false) }
  }

  function validate() {
    const e = {}
    if (!form.fullName.trim()) e.fullName = 'El nombre es requerido'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!validate()) return
    setSaving(true)
    try {
      const data = {
        fullName:        form.fullName.trim(),
        shortName:       form.shortName.trim() || null,
        birthDate:       form.birthDate || null,
        phone:           form.phone.trim() || null,
        address:         form.address.trim() || null,
        joinDate:        form.joinDate || null,
        spiritualStatus: form.spiritualStatus,
        groupIds:        form.groupIds,
        groupId:         form.groupIds[0] || null,
        referredById:    form.referredById || null,
        referredBy:      form.referredBy.trim() || null,
        active:          form.active,
        updatedAt:       new Date().toISOString(),
      }
      if (isEdit) {
        await updateDoc(doc(db, 'members', id), data)
        ok('Miembro actualizado')
      } else {
        data.createdAt = new Date().toISOString()
        await addDoc(collection(db, 'members'), data)
        ok('Miembro agregado')
      }
      navigate(-1)
    } catch { toastError('Error al guardar') }
    finally { setSaving(false) }
  }

  if (loading) return (
    <div className="flex flex-col" style={{ background: 'var(--bg)' }}>
      <TopBar title={isEdit ? 'Editar miembro' : 'Nuevo miembro'} />
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 rounded-full border-2 animate-spin-slow"
          style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    </div>
  )

  return (
    <div className="flex flex-col" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      <TopBar title={isEdit ? 'Editar miembro' : 'Nuevo miembro'} />

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-4 py-4">
        <Inp label="Nombre completo *" value={form.fullName} onChange={e => set('fullName', e.target.value)} placeholder="Juan Pablo García" autoCapitalize="words" error={errors.fullName} />
        <Inp label="Nombre corto" value={form.shortName} onChange={e => set('shortName', e.target.value)} placeholder="Juanpa (opcional)" />
        <Inp label="Fecha de nacimiento" type="date" value={form.birthDate} onChange={e => set('birthDate', e.target.value)} style={{ colorScheme: 'dark' }} />
        <Inp label="WhatsApp" type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+57 300 000 0000" />
        <Inp label="Dirección" value={form.address} onChange={e => set('address', e.target.value)} placeholder="Barrio, ciudad" />
        <Inp label="Fecha de ingreso" type="date" value={form.joinDate} onChange={e => set('joinDate', e.target.value)} style={{ colorScheme: 'dark' }} />

        <MemberCombobox
          label="Invitado por"
          members={members}
          selectedId={form.referredById}
          legacyText={!form.referredById && form.referredBy ? form.referredBy : ''}
          onSelect={setReferredBy}
          excludeId={id}
        />

        <Sel label="Estado espiritual" value={form.spiritualStatus} onChange={e => set('spiritualStatus', e.target.value)}>
          <option value="new">Nuevo</option>
          <option value="following">En seguimiento</option>
          <option value="consolidated">Consolidado</option>
          <option value="member">Miembro</option>
          <option value="leader">Líder</option>
        </Sel>

        {groups.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-2)' }}>
              Grupos {form.groupIds.length > 0 && `(${form.groupIds.length} seleccionado${form.groupIds.length !== 1 ? 's' : ''})`}
            </p>
            <div className="flex flex-col gap-2">
              {groups.map(g => {
                const checked = form.groupIds.includes(g.id)
                return (
                  <button type="button" key={g.id} onClick={() => toggleGroup(g.id)}
                    className="flex items-center gap-3 px-4 py-3 rounded-[12px] text-left press"
                    style={{
                      background: checked ? 'rgba(59,130,246,0.08)' : 'var(--surface)',
                      border: `1px solid ${checked ? 'rgba(59,130,246,0.35)' : 'var(--border)'}`,
                    }}>
                    <div className="w-5 h-5 rounded-[6px] flex items-center justify-center flex-shrink-0 transition-colors"
                      style={{
                        background: checked ? 'var(--accent)' : 'var(--card)',
                        border: `1.5px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
                      }}>
                      {checked && <Check size={11} weight="bold" style={{ color: 'white' }} />}
                    </div>
                    <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--text)' }}>{g.name}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {isEdit && (
          <div className="flex items-center justify-between p-4 rounded-[12px]"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Miembro activo</span>
            <button
              type="button"
              onClick={() => set('active', !form.active)}
              className="relative w-12 h-6 rounded-full transition-colors"
              style={{ background: form.active ? 'var(--green)' : 'var(--text-3)' }}>
              <span className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all"
                style={{ left: form.active ? '26px' : '4px' }} />
            </button>
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="h-14 rounded-[14px] font-bold text-[15px] flex items-center justify-center gap-2 mt-2 press"
          style={{ background: 'var(--accent-g)', color: 'white', boxShadow: '0 4px 20px rgba(59,130,246,0.28)' }}>
          {saving
            ? <span className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin-slow" />
            : isEdit ? 'Guardar cambios' : 'Agregar miembro'}
        </button>
      </form>
    </div>
  )
}
