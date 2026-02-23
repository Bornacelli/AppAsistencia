import { useState, useEffect } from 'react'
import { doc, getDoc, setDoc, collection, getDocs, addDoc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useToast } from '../context/ToastContext'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import Modal from '../components/ui/Modal'
import { Inp } from '../components/ui/Inp'
import { Gear, Plus, PencilSimple, CheckSquare } from '@phosphor-icons/react'

export default function Settings() {
  const { ok, error: toastError } = useToast()

  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [groups,   setGroups]   = useState([])
  const [modal,    setModal]    = useState(null)
  const [selGroup, setSelGroup] = useState(null)
  const [groupForm, setGroupForm] = useState({ name: '', active: true })

  const [config, setConfig] = useState({
    churchName:         '',
    meetingDayName:     '',
    absenceAlertWeeks:  2,
  })
  const setC = (k, v) => setConfig(c => ({ ...c, [k]: v }))

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [cfgSnap, gSnap] = await Promise.all([
        getDoc(doc(db, 'config', 'general')),
        getDocs(collection(db, 'groups')),
      ])
      if (cfgSnap.exists()) {
        const d = cfgSnap.data()
        setConfig({
          churchName:        d.churchName        || '',
          meetingDayName:    d.meetingDayName    || '',
          absenceAlertWeeks: d.absenceAlertWeeks || 2,
        })
      }
      setGroups(gSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es')))
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  async function saveConfig(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await setDoc(doc(db, 'config', 'general'), {
        churchName:        config.churchName.trim(),
        meetingDayName:    config.meetingDayName.trim(),
        absenceAlertWeeks: Number(config.absenceAlertWeeks),
        updatedAt:         new Date().toISOString(),
      }, { merge: true })
      ok('Configuración guardada')
    } catch { toastError('Error al guardar') }
    finally { setSaving(false) }
  }

  async function handleGroupSave(e) {
    e.preventDefault()
    if (!groupForm.name.trim()) { toastError('El nombre es requerido'); return }
    setSaving(true)
    try {
      if (selGroup) {
        await updateDoc(doc(db, 'groups', selGroup.id), { name: groupForm.name.trim(), active: groupForm.active })
        setGroups(prev => prev.map(g => g.id === selGroup.id ? { ...g, name: groupForm.name.trim(), active: groupForm.active } : g))
      } else {
        const ref = await addDoc(collection(db, 'groups'), { name: groupForm.name.trim(), active: true, createdAt: new Date().toISOString() })
        setGroups(prev => [...prev, { id: ref.id, name: groupForm.name.trim(), active: true }])
      }
      setModal(null)
      setSelGroup(null)
      ok(selGroup ? 'Grupo actualizado' : 'Grupo creado')
    } catch { toastError('Error al guardar') }
    finally { setSaving(false) }
  }

  function openEditGroup(g) {
    setSelGroup(g)
    setGroupForm({ name: g.name || '', active: g.active !== false })
    setModal('group')
  }

  function openAddGroup() {
    setSelGroup(null)
    setGroupForm({ name: '', active: true })
    setModal('group')
  }

  if (loading) return (
    <div style={{ background: 'var(--bg)', minHeight: '100%' }}>
      <div className="sticky top-0 z-10 px-4 py-3" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <h1 className="font-syne font-extrabold text-[17px]" style={{ color: 'var(--text)' }}>Configuración</h1>
      </div>
      <LoadingSpinner />
    </div>
  )

  return (
    <div className="flex flex-col" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <Gear size={20} style={{ color: 'var(--accent)' }} />
        <h1 className="font-syne font-extrabold text-[17px]" style={{ color: 'var(--text)' }}>Configuración</h1>
      </div>

      <div className="px-4 py-4 flex flex-col gap-6">
        {/* General settings */}
        <form onSubmit={saveConfig} className="flex flex-col gap-4">
          <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-2)' }}>General</p>

          <Inp
            label="Nombre de la iglesia o grupo"
            value={config.churchName}
            onChange={e => setC('churchName', e.target.value)}
            placeholder="Ej: Grupo Juvenil Jesús Vive"
          />
          <Inp
            label="Nombre del día de reunión"
            value={config.meetingDayName}
            onChange={e => setC('meetingDayName', e.target.value)}
            placeholder="Ej: Culto dominical, Viernes de jóvenes"
          />

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--accent)' }}>
              Semanas para alerta de inasistencia
            </label>
            <div className="flex items-center gap-3">
              {[1, 2, 3, 4].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setC('absenceAlertWeeks', n)}
                  className="flex-1 py-2.5 rounded-[10px] text-sm font-bold press"
                  style={{
                    background: config.absenceAlertWeeks === n ? 'rgba(59,130,246,0.15)' : 'var(--surface)',
                    color: config.absenceAlertWeeks === n ? 'var(--accent)' : 'var(--text-2)',
                    border: `1px solid ${config.absenceAlertWeeks === n ? 'rgba(59,130,246,0.3)' : 'var(--border)'}`,
                  }}>
                  {n}
                </button>
              ))}
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
              Alerta cuando un miembro lleva {config.absenceAlertWeeks} reunión{config.absenceAlertWeeks > 1 ? 'es' : ''} consecutiva{config.absenceAlertWeeks > 1 ? 's' : ''} sin asistir
            </p>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="h-12 rounded-[12px] font-bold text-sm flex items-center justify-center gap-2 press"
            style={{ background: 'var(--accent-g)', color: 'white' }}>
            {saving ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin-slow" /> : 'Guardar configuración'}
          </button>
        </form>

        {/* Groups management */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-2)' }}>
              Grupos / Secciones
            </p>
            <button onClick={openAddGroup}
              className="h-8 px-3 flex items-center gap-1.5 rounded-[8px] text-xs font-bold press"
              style={{ background: 'var(--accent-g)', color: 'white' }}>
              <Plus size={14} weight="bold" /> Nuevo
            </button>
          </div>

          {groups.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm" style={{ color: 'var(--text-3)' }}>Sin grupos creados aún</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {groups.map(g => (
                <div key={g.id} className="flex items-center gap-3 px-4 py-3 rounded-[12px]"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', opacity: g.active === false ? 0.5 : 1 }}>
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: g.active !== false ? 'var(--green)' : 'var(--text-3)' }} />
                  <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--text)' }}>{g.name}</span>
                  {g.active === false && <span className="text-[10px] font-bold" style={{ color: 'var(--text-3)' }}>Inactivo</span>}
                  <button onClick={() => openEditGroup(g)}
                    className="w-8 h-8 flex items-center justify-center rounded-[8px] press"
                    style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                    <PencilSimple size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Group modal */}
      <Modal open={modal === 'group'} onClose={() => { setModal(null); setSelGroup(null) }} title={selGroup ? 'Editar grupo' : 'Nuevo grupo'}>
        <form onSubmit={handleGroupSave} className="flex flex-col gap-4">
          <Inp label="Nombre del grupo *" value={groupForm.name} onChange={e => setGroupForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej: Grupo Alpha, Jóvenes Norte" autoCapitalize="words" />

          {selGroup && (
            <div className="flex items-center justify-between p-4 rounded-[12px]"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Grupo activo</span>
              <button type="button" onClick={() => setGroupForm(f => ({ ...f, active: !f.active }))}
                className="relative w-12 h-6 rounded-full transition-colors"
                style={{ background: groupForm.active ? 'var(--green)' : 'var(--text-3)' }}>
                <span className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all"
                  style={{ left: groupForm.active ? '26px' : '4px' }} />
              </button>
            </div>
          )}

          <button type="submit" disabled={saving}
            className="h-12 rounded-[12px] font-bold text-sm flex items-center justify-center gap-2 press"
            style={{ background: 'var(--accent-g)', color: 'white' }}>
            {saving ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin-slow" /> : selGroup ? 'Guardar cambios' : 'Crear grupo'}
          </button>
        </form>
      </Modal>
    </div>
  )
}
