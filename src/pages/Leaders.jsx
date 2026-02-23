import { useState, useEffect } from 'react'
import { collection, getDocs, doc, setDoc, updateDoc, getDoc } from 'firebase/firestore'
import { createUserWithEmailAndPassword, signOut, signInWithEmailAndPassword } from 'firebase/auth'
import { db, auth } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import Modal from '../components/ui/Modal'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import Avatar from '../components/ui/Avatar'
import { Inp, Sel } from '../components/ui/Inp'
import { UserCircle, Plus, PencilSimple, ShieldCheck, User, Users } from '@phosphor-icons/react'
import { todayStr } from '../utils/dates'

const ROLE_LABEL = { admin: 'Administrador', leader: 'Líder', assistant: 'Asistente' }
const ROLE_COLOR = { admin: '#a78bfa', leader: 'var(--accent)', assistant: 'var(--green)' }

export default function Leaders() {
  const { profile } = useAuth()
  const { ok, error: toastError, warn } = useToast()

  const [leaders, setLeaders] = useState([])
  const [groups,  setGroups]  = useState([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState(null)  // null | 'add' | 'edit'
  const [selUser, setSelUser] = useState(null)
  const [saving,  setSaving]  = useState(false)

  const [form, setForm] = useState({
    name: '', email: '', password: '', role: 'leader', groupIds: [], active: true
  })
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [lSnap, gSnap] = await Promise.all([
        getDocs(collection(db, 'leaders')),
        getDocs(collection(db, 'groups')),
      ])
      setLeaders(lSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es')))
      setGroups(gSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(g => g.active !== false))
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  function openAdd() {
    setForm({ name: '', email: '', password: '', role: 'leader', groupIds: [], active: true })
    setSelUser(null)
    setModal('add')
  }

  function openEdit(user) {
    setSelUser(user)
    setForm({ name: user.name || '', email: user.email || '', password: '', role: user.role || 'leader', groupIds: user.groupIds || [], active: user.active !== false })
    setModal('edit')
  }

  function toggleGroup(gid) {
    setForm(f => ({
      ...f,
      groupIds: f.groupIds.includes(gid) ? f.groupIds.filter(x => x !== gid) : [...f.groupIds, gid]
    }))
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.email.trim() || form.password.length < 6) {
      toastError('Completa todos los campos. Contraseña mínima 6 caracteres.')
      return
    }

    setSaving(true)
    const adminEmail    = auth.currentUser?.email
    const adminPassword = prompt('Para continuar, ingresa tu contraseña de administrador:')
    if (!adminPassword) { setSaving(false); return }

    try {
      // Create the new user
      const cred = await createUserWithEmailAndPassword(auth, form.email.trim(), form.password)
      await setDoc(doc(db, 'leaders', cred.user.uid), {
        name:      form.name.trim(),
        email:     form.email.trim().toLowerCase(),
        role:      form.role,
        groupIds:  form.groupIds,
        active:    form.active,
        createdAt: new Date().toISOString(),
      })
      // Sign out new user, sign admin back in
      await signOut(auth)
      try {
        await signInWithEmailAndPassword(auth, adminEmail, adminPassword)
        await loadData()
        setModal(null)
        ok(`${form.name} creado como ${ROLE_LABEL[form.role]}`)
      } catch {
        warn('Usuario creado. Por favor inicia sesión de nuevo.')
      }
    } catch (err) {
      const msg = err.code === 'auth/email-already-in-use' ? 'Este correo ya está en uso'
        : err.code === 'auth/invalid-email' ? 'Correo inválido'
        : 'Error al crear el usuario'
      toastError(msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdate(e) {
    e.preventDefault()
    if (!form.name.trim()) { toastError('El nombre es requerido'); return }
    setSaving(true)
    try {
      await updateDoc(doc(db, 'leaders', selUser.id), {
        name:     form.name.trim(),
        role:     form.role,
        groupIds: form.groupIds,
        active:   form.active,
      })
      await loadData()
      setModal(null)
      ok('Usuario actualizado')
    } catch { toastError('Error al actualizar') }
    finally { setSaving(false) }
  }

  return (
    <div className="flex flex-col" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <h1 className="font-syne font-extrabold text-[17px]" style={{ color: 'var(--text)' }}>Líderes y asistentes</h1>
        <button onClick={openAdd}
          className="h-9 px-4 flex items-center gap-1.5 rounded-[10px] text-sm font-bold press"
          style={{ background: 'var(--accent-g)', color: 'white' }}>
          <Plus size={16} weight="bold" /> Nuevo
        </button>
      </div>

      <div className="px-4 py-4">
        {loading ? <LoadingSpinner /> : leaders.length === 0 ? (
          <EmptyState icon={Users} title="Sin usuarios" description="Crea el primer líder con el botón de arriba." />
        ) : (
          leaders.map(u => (
            <div key={u.id} className="flex items-center gap-3 rounded-[10px] px-3 py-3 mb-2"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', opacity: u.active === false ? 0.5 : 1 }}>
              <Avatar name={u.name} size={44} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate" style={{ color: 'var(--text)' }}>{u.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] font-bold" style={{ color: ROLE_COLOR[u.role] || 'var(--text-2)' }}>
                    {ROLE_LABEL[u.role] || u.role}
                  </span>
                  {(u.groupIds || []).length > 0 && (
                    <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                      · {(u.groupIds || []).length} grupo{(u.groupIds || []).length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
              {u.id !== profile.uid && (
                <button onClick={() => openEdit(u)}
                  className="w-9 h-9 flex items-center justify-center rounded-[10px] press"
                  style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                  <PencilSimple size={16} />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Add / Edit modal */}
      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal === 'add' ? 'Nuevo usuario' : 'Editar usuario'}>
        <form onSubmit={modal === 'add' ? handleCreate : handleUpdate} className="flex flex-col gap-4">
          <Inp label="Nombre completo *" value={form.name} onChange={e => setF('name', e.target.value)} placeholder="Juan García" autoCapitalize="words" />

          {modal === 'add' && (
            <>
              <Inp label="Correo electrónico *" type="email" value={form.email} onChange={e => setF('email', e.target.value)} placeholder="lider@iglesia.com" autoCapitalize="none" />
              <Inp label="Contraseña inicial *" type="password" value={form.password} onChange={e => setF('password', e.target.value)} placeholder="Mínimo 6 caracteres" />
            </>
          )}

          <Sel label="Rol" value={form.role} onChange={e => setF('role', e.target.value)}>
            <option value="admin">Administrador</option>
            <option value="leader">Líder</option>
            <option value="assistant">Asistente</option>
          </Sel>

          {/* Group assignment */}
          {groups.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--accent)' }}>
                Grupos asignados
              </p>
              <div className="flex flex-col gap-1.5">
                {groups.map(g => (
                  <label key={g.id} className="flex items-center gap-3 p-3 rounded-[10px] cursor-pointer press"
                    style={{ background: 'var(--card)', border: `1px solid ${form.groupIds.includes(g.id) ? 'rgba(59,130,246,0.3)' : 'var(--border)'}` }}>
                    <input type="checkbox" checked={form.groupIds.includes(g.id)} onChange={() => toggleGroup(g.id)}
                      className="w-4 h-4 rounded" style={{ accentColor: 'var(--accent)' }} />
                    <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{g.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {modal === 'edit' && (
            <div className="flex items-center justify-between p-4 rounded-[12px]"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Cuenta activa</span>
              <button type="button" onClick={() => setF('active', !form.active)}
                className="relative w-12 h-6 rounded-full transition-colors"
                style={{ background: form.active ? 'var(--green)' : 'var(--text-3)' }}>
                <span className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all"
                  style={{ left: form.active ? '26px' : '4px' }} />
              </button>
            </div>
          )}

          {modal === 'add' && (
            <div className="p-3 rounded-[10px] text-xs leading-relaxed" style={{ background: 'var(--amber-bg)', color: 'var(--amber)', border: '1px solid var(--amber-bdr)' }}>
              Se te pedirá tu contraseña de administrador para completar la creación del usuario.
            </div>
          )}

          <button type="submit" disabled={saving}
            className="h-12 rounded-[12px] font-bold text-sm flex items-center justify-center gap-2 press"
            style={{ background: 'var(--accent-g)', color: 'white' }}>
            {saving ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin-slow" /> : modal === 'add' ? 'Crear usuario' : 'Guardar cambios'}
          </button>
        </form>
      </Modal>
    </div>
  )
}
