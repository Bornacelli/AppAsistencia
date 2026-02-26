import { useState, useEffect } from 'react'
import { collection, getDocs, doc, getDoc, addDoc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useToast } from '../context/ToastContext'
import TopBar from '../components/layout/TopBar'
import { Inp, Sel } from '../components/ui/Inp'
import { Check } from '@phosphor-icons/react'
import { todayStr } from '../utils/dates'
import { getMemberGroupIds } from '../utils/members'

export default function MemberForm() {
  const { id } = useParams()
  const isEdit = !!id
  const { profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { ok, error: toastError } = useToast()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'

  // Pre-fill from visitor conversion
  const fromVisitor = location.state?.fromVisitor

  const [groups,  setGroups]  = useState([])
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
    referredBy:      fromVisitor?.referredBy || '',
    active:          true,
  })

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  function toggleGroup(gid) {
    setForm(f => ({
      ...f,
      groupIds: f.groupIds.includes(gid)
        ? f.groupIds.filter(id => id !== gid)
        : [...f.groupIds, gid],
    }))
  }

  useEffect(() => {
    loadGroups()
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
        groupId:         form.groupIds[0] || null, // backward compat
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
        <Inp label="Invitado por" value={form.referredBy} onChange={e => set('referredBy', e.target.value)} placeholder="Nombre de quien lo invitó (opcional)" />

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
