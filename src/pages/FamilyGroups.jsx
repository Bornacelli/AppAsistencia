import { useState, useEffect } from 'react'
import { collection, getDocs, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import Modal from '../components/ui/Modal'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import { Inp } from '../components/ui/Inp'
import { Plus, PencilSimple, Users, Trash, MapPin, ArrowLeft } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'

const DEFAULT_CITY = 'Soledad'

// Bounding box área metropolitana Barranquilla/Soledad — evita resultados de otras ciudades
const VIEWBOX = '-75.05,10.70,-74.45,11.15'

async function geocodeAddress(street, neighborhood, city) {
  const query = [street, neighborhood, city, 'Colombia'].filter(s => s.trim()).join(', ')
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search` +
    `?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=co` +
    `&viewbox=${VIEWBOX}&bounded=0`,
    { headers: { 'Accept-Language': 'es' } }
  )
  const data = await res.json()
  if (!data.length) return null
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
}

const EMPTY_FORM = {
  name: '', zone: '',
  city: DEFAULT_CITY, neighborhood: '', street: '',
  leaders: [{ name: '', phone: '' }],
  active: true,
}

export default function FamilyGroups() {
  const { profile }            = useAuth()
  const { ok, error: toastError } = useToast()
  const isConsolidacion = profile?.role === 'consolidacion'

  const [groups,    setGroups]    = useState([])
  const [loading,   setLoading]   = useState(true)
  const [modal,     setModal]     = useState(null)
  const [selGroup,  setSelGroup]  = useState(null)
  const [saving,    setSaving]    = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  const [form,      setForm]      = useState(EMPTY_FORM)

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => { loadGroups() }, [])

  async function loadGroups() {
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, 'familyGroups'))
      setGroups(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'))
      )
    } catch (e) {
      console.error('Error cargando grupos:', e)
      toastError('Error al cargar los grupos.')
    }
    setLoading(false)
  }

  function openAdd() {
    setForm(EMPTY_FORM)
    setSelGroup(null)
    setModal('add')
  }

  function openEdit(g) {
    setSelGroup(g)
    setForm({
      name:         g.name         || '',
      zone:         g.zone         || '',
      city:         g.city         || DEFAULT_CITY,
      neighborhood: g.neighborhood || '',
      street:       g.street       || '',
      leaders:      g.leaders?.length ? g.leaders : [{ name: '', phone: '' }],
      active:       g.active !== false,
    })
    setModal('edit')
  }

  function setLeader(i, field, value) {
    setForm(f => {
      const leaders = [...f.leaders]
      leaders[i] = { ...leaders[i], [field]: value }
      return { ...f, leaders }
    })
  }

  function addLeader() {
    setForm(f => ({ ...f, leaders: [...f.leaders, { name: '', phone: '' }] }))
  }

  function removeLeader(i) {
    setForm(f => ({ ...f, leaders: f.leaders.filter((_, j) => j !== i) }))
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.street.trim() || !form.city.trim()) {
      toastError('Nombre, ciudad y dirección son requeridos.')
      return
    }

    const addressChanged = !selGroup
      || selGroup.street        !== form.street.trim()
      || selGroup.city          !== form.city.trim()
      || selGroup.neighborhood  !== form.neighborhood.trim()

    setSaving(true)

    try {
      let coordinates = selGroup?.coordinates || null

      if (addressChanged) {
        setGeocoding(true)
        coordinates = await geocodeAddress(form.street, form.neighborhood, form.city)
        setGeocoding(false)
        if (!coordinates) {
          toastError('No se pudo localizar la dirección. Verifica que sea correcta.')
          setSaving(false)
          return
        }
      }

      const fullAddress = [form.street, form.neighborhood, form.city]
        .map(s => s.trim()).filter(Boolean).join(', ')

      const data = {
        name:         form.name.trim(),
        zone:         form.zone.trim(),
        city:         form.city.trim(),
        neighborhood: form.neighborhood.trim(),
        street:       form.street.trim(),
        address:      fullAddress,
        coordinates,
        leaders:      form.leaders.filter(l => l.name.trim()),
        active:       form.active,
      }

      if (modal === 'add') {
        await addDoc(collection(db, 'familyGroups'), { ...data, createdAt: serverTimestamp() })
        ok(`Grupo "${data.name}" creado`)
      } else {
        await updateDoc(doc(db, 'familyGroups', selGroup.id), data)
        ok('Grupo actualizado')
      }

      await loadGroups()
      setModal(null)
    } catch (e) {
      console.error('Error guardando grupo:', e)
      toastError('Error al guardar. Verifica los permisos de Firestore.')
    } finally {
      setSaving(false)
      setGeocoding(false)
    }
  }

  return (
    <div className="flex flex-col" style={{ background: 'var(--bg)', minHeight: '100%' }}>

      {/* Header */}
      <div
        className="sticky top-0 z-10 flex items-center justify-between px-4 py-3"
        style={{
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          paddingTop: 'max(12px, env(safe-area-inset-top))',
        }}
      >
        <div className="flex items-center gap-2">
          {isConsolidacion && (
            <Link
              to="/consolidacion"
              className="w-9 h-9 flex items-center justify-center rounded-[10px] press"
              style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
            >
              <ArrowLeft size={18} />
            </Link>
          )}
          <h1 className="font-syne font-extrabold text-[17px]" style={{ color: 'var(--text)' }}>
            Grupos Familiares
          </h1>
        </div>
        <button
          onClick={openAdd}
          className="h-9 px-4 flex items-center gap-1.5 rounded-[10px] text-sm font-bold press"
          style={{ background: 'var(--accent-g)', color: 'white' }}
        >
          <Plus size={16} weight="bold" /> Nuevo
        </button>
      </div>

      <div className="px-4 py-4">
        {loading ? (
          <LoadingSpinner />
        ) : groups.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Sin grupos"
            description="Agrega el primer grupo familiar con el botón de arriba."
          />
        ) : (
          groups.map(g => <GroupRow key={g.id} group={g} onEdit={() => openEdit(g)} />)
        )}
      </div>

      {/* Modal */}
      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal === 'add' ? 'Nuevo grupo familiar' : 'Editar grupo'}
      >
        <form onSubmit={handleSave} className="flex flex-col gap-4">

          <Inp
            label="Nombre del grupo *"
            value={form.name}
            onChange={e => setF('name', e.target.value)}
            placeholder="Ej: Grupo Centenario"
            autoCapitalize="words"
          />
          <Inp
            label="Zona / Sector"
            value={form.zone}
            onChange={e => setF('zone', e.target.value)}
            placeholder="Ej: Zona 1"
          />

          {/* Ubicación del grupo */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--accent)' }}>
              Ubicación del grupo
            </p>
            <div className="flex flex-col gap-2">
              <Inp
                label="Ciudad / Municipio *"
                value={form.city}
                onChange={e => setF('city', e.target.value)}
                placeholder="Soledad"
              />
              <Inp
                label="Barrio"
                value={form.neighborhood}
                onChange={e => setF('neighborhood', e.target.value)}
                placeholder="Ej: Centenario..."
                autoCapitalize="words"
              />
              <div>
                <Inp
                  label="Dirección *"
                  value={form.street}
                  onChange={e => setF('street', e.target.value)}
                  placeholder="Ej: Cra 15 #20-40"
                />
                <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-3)' }}>
                  Se geocodifica automáticamente para calcular distancias.
                </p>
              </div>
            </div>
          </div>

          {/* Líderes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--accent)' }}>
                Líderes
              </p>
              <button
                type="button"
                onClick={addLeader}
                className="text-[11px] font-bold px-2.5 py-1 rounded-[7px] press"
                style={{ background: 'var(--card)', color: 'var(--accent)' }}
              >
                + Agregar
              </button>
            </div>
            <div className="flex flex-col gap-3">
              {form.leaders.map((l, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="flex-1 flex flex-col gap-2">
                    <Inp
                      placeholder="Nombre del líder"
                      value={l.name}
                      onChange={e => setLeader(i, 'name', e.target.value)}
                      autoCapitalize="words"
                    />
                    <Inp
                      placeholder="+57 300 123 4567"
                      value={l.phone}
                      onChange={e => setLeader(i, 'phone', e.target.value)}
                      type="tel"
                    />
                  </div>
                  {form.leaders.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLeader(i)}
                      className="w-9 h-9 flex items-center justify-center rounded-[10px] press flex-shrink-0"
                      style={{ background: 'var(--red-bg)', border: '1px solid var(--red-bdr)', color: 'var(--red)', marginTop: 2 }}
                    >
                      <Trash size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {modal === 'edit' && (
            <div
              className="flex items-center justify-between p-4 rounded-[12px]"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Grupo activo</span>
              <button
                type="button"
                onClick={() => setF('active', !form.active)}
                className="relative w-12 h-6 rounded-full transition-colors"
                style={{ background: form.active ? 'var(--green)' : 'var(--text-3)' }}
              >
                <span
                  className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all"
                  style={{ left: form.active ? '26px' : '4px' }}
                />
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="h-12 rounded-[12px] font-bold text-sm flex items-center justify-center gap-2 press"
            style={{ background: 'var(--accent-g)', color: 'white' }}
          >
            {saving ? (
              <>
                <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin-slow" />
                {geocoding ? 'Localizando dirección...' : 'Guardando...'}
              </>
            ) : modal === 'add' ? 'Crear grupo' : 'Guardar cambios'}
          </button>
        </form>
      </Modal>
    </div>
  )
}

function GroupRow({ group: g, onEdit }) {
  const leaders = (g.leaders || []).filter(l => l.name)
  return (
    <div
      className="flex items-start gap-3 rounded-[12px] px-3 py-3 mb-2"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        opacity: g.active === false ? 0.45 : 1,
      }}
    >
      <div
        className="w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0"
        style={{ background: 'var(--card)', color: 'var(--accent)' }}
      >
        <Users size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>
          {g.name}{g.zone ? ` · ${g.zone}` : ''}
          {g.active === false && (
            <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-[5px]"
              style={{ background: 'var(--red-bg)', color: 'var(--red)' }}>
              Inactivo
            </span>
          )}
        </p>
        {g.address && (
          <p className="text-[11px] mt-0.5 flex items-center gap-1 truncate" style={{ color: 'var(--text-3)' }}>
            <MapPin size={11} style={{ flexShrink: 0 }} /> {g.address}
          </p>
        )}
        {leaders.map((l, i) => (
          <p key={i} className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>
            {l.name}{l.phone ? ` · ${l.phone}` : ''}
          </p>
        ))}
      </div>
      <button
        onClick={onEdit}
        className="w-9 h-9 flex items-center justify-center rounded-[10px] press flex-shrink-0"
        style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
      >
        <PencilSimple size={16} />
      </button>
    </div>
  )
}
