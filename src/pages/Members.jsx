import { useState, useEffect, useMemo } from 'react'
import { collection, getDocs, query, where, doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import Avatar from '../components/ui/Avatar'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import { MagnifyingGlass, Plus, Users, FunnelSimple, ArrowRight } from '@phosphor-icons/react'

const SPIRITUAL_LABEL = {
  new: 'Nuevo', following: 'En seguimiento', consolidated: 'Consolidado', leader: 'Líder'
}
const SPIRITUAL_COLOR = {
  new: 'var(--amber)', following: 'var(--accent)', consolidated: 'var(--green)', leader: '#a78bfa'
}

export default function Members() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const isAdmin = profile?.role === 'admin'

  const [members,    setMembers]    = useState([])
  const [groups,     setGroups]     = useState([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [filterGroup,    setFilterGroup]    = useState('')
  const [filterStatus,   setFilterStatus]   = useState('')
  const [filterActive,   setFilterActive]   = useState('true')
  const [showFilters,    setShowFilters]     = useState(false)

  useEffect(() => { loadData() }, [profile])

  async function loadData() {
    setLoading(true)
    try {
      const [mSnap, gSnap] = await Promise.all([
        getDocs(collection(db, 'members')),
        getDocs(collection(db, 'groups')),
      ])
      let mems = mSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      if (!isAdmin) {
        const gids = profile?.groupIds || []
        mems = mems.filter(m => gids.includes(m.groupId))
      }
      mems.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', 'es'))
      setMembers(mems)
      setGroups(gSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const filtered = useMemo(() => {
    return members.filter(m => {
      const q = search.toLowerCase()
      const matchSearch = !q || (m.fullName || '').toLowerCase().includes(q) || (m.phone || '').includes(q)
      const matchGroup  = !filterGroup  || m.groupId === filterGroup
      const matchStatus = !filterStatus || m.spiritualStatus === filterStatus
      const matchActive = filterActive === '' || String(m.active !== false) === filterActive
      return matchSearch && matchGroup && matchStatus && matchActive
    })
  }, [members, search, filterGroup, filterStatus, filterActive])

  const groupName = (id) => groups.find(g => g.id === id)?.name || ''

  return (
    <div className="flex flex-col" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <h1 className="font-syne font-extrabold text-[17px]" style={{ color: 'var(--text)' }}>Miembros</h1>
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

      {/* Filters */}
      {showFilters && (
        <div className="px-4 pb-3 grid grid-cols-3 gap-2 animate-slide-up">
          {[
            { value: filterGroup,  setter: setFilterGroup,  opts: [['', 'Todos los grupos'], ...groups.map(g => [g.id, g.name])], label: 'Grupo' },
            { value: filterStatus, setter: setFilterStatus, opts: [['', 'Todos'], ['new','Nuevo'], ['following','Seguimiento'], ['consolidated','Consolidado'], ['leader','Líder']], label: 'Estado' },
            { value: filterActive, setter: setFilterActive, opts: [['true','Activos'], ['false','Inactivos'], ['','Todos']], label: 'Estado' },
          ].map((f, i) => (
            <select key={i} value={f.value} onChange={e => f.setter(e.target.value)}
              className="rounded-[9px] px-3 py-2 text-xs font-medium outline-none"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit' }}>
              {f.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          ))}
        </div>
      )}

      {/* List */}
      <div className="px-4 pb-4">
        {loading ? (
          <LoadingSpinner />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Users} title="Sin miembros" description="Agrega el primer miembro con el botón de arriba." />
        ) : (
          <>
            <p className="text-[11px] font-bold uppercase tracking-widest py-2" style={{ color: 'var(--text-2)' }}>
              {filtered.length} miembro{filtered.length !== 1 ? 's' : ''}
            </p>
            {filtered.map(m => (
              <button
                key={m.id}
                onClick={() => navigate(`/members/${m.id}`)}
                className="flex items-center gap-3 rounded-[10px] px-3 py-3 mb-2 w-full text-left press"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', opacity: m.active === false ? 0.5 : 1 }}>
                <Avatar name={m.fullName} size={44} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: 'var(--text)' }}>{m.fullName}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {m.spiritualStatus && (
                      <span className="text-[10px] font-bold"
                        style={{ color: SPIRITUAL_COLOR[m.spiritualStatus] || 'var(--text-2)' }}>
                        {SPIRITUAL_LABEL[m.spiritualStatus] || m.spiritualStatus}
                      </span>
                    )}
                    {m.groupId && groupName(m.groupId) && (
                      <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>· {groupName(m.groupId)}</span>
                    )}
                  </div>
                </div>
                <ArrowRight size={16} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
