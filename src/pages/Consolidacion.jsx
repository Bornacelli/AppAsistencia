import { useState, useEffect, useRef } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db, auth } from '../firebase'
import { signOut } from 'firebase/auth'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { Phone, WhatsappLogo, SignOut, Users, MapTrifold, Gear, MagnifyingGlass, MapPin, X } from '@phosphor-icons/react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const DEFAULT_CENTER = [-74.7667, 10.9167] // Soledad, Atlántico
const DEFAULT_ZOOM   = 13
const DEFAULT_CITY   = 'Soledad'

// Bounding box alrededor del área metropolitana de Barranquilla/Soledad
// Esto evita que Nominatim devuelva resultados de Bogotá u otras ciudades
const VIEWBOX = '-75.05,10.70,-74.45,11.15'

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function formatDistance(km) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
}

async function searchAddress(neighborhood, street, city) {
  const q = [street, neighborhood, city, 'Colombia'].filter(s => s.trim()).join(', ')
  const url =
    `https://nominatim.openstreetmap.org/search` +
    `?q=${encodeURIComponent(q)}` +
    `&format=json&limit=5&addressdetails=1` +
    `&countrycodes=co` +
    `&viewbox=${VIEWBOX}&bounded=0` // bounded=0 permite salir del viewbox si no hay resultado, pero prioriza dentro
  const res = await fetch(url, { headers: { 'Accept-Language': 'es' } })
  return res.json()
}

export default function Consolidacion() {
  const navigate               = useNavigate()
  const { profile }            = useAuth()
  const { ok, error: toastError } = useToast()

  const isConsolidacion = profile?.role === 'consolidacion'

  const [city,          setCity]          = useState(DEFAULT_CITY)
  const [neighborhood,  setNeighborhood]  = useState('')
  const [street,        setStreet]        = useState('')
  const [searching,     setSearching]     = useState(false)
  const [suggestions,   setSuggestions]   = useState(null) // null | array
  const [allGroups,     setAllGroups]     = useState([])
  const [results,       setResults]       = useState(null)
  const [personCoords,  setPersonCoords]  = useState(null)
  const [confirmOut,    setConfirmOut]    = useState(false)

  const mapContainerRef = useRef(null)
  const mapRef          = useRef(null)
  const markersRef      = useRef([])

  useEffect(() => {
    getDocs(collection(db, 'familyGroups'))
      .then(snap => setAllGroups(
        snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(g => g.active !== false && g.coordinates)
      ))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: DEFAULT_CENTER,
      zoom:   DEFAULT_ZOOM,
    })
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []
    if (!results || !personCoords) return

    const bounds = new maplibregl.LngLatBounds()

    // Marcador persona (rojo)
    const elP = document.createElement('div')
    elP.style.cssText = 'width:14px;height:14px;background:#ef4444;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.6)'
    const mP = new maplibregl.Marker({ element: elP })
      .setLngLat([personCoords.lng, personCoords.lat])
      .setPopup(new maplibregl.Popup({ offset: 14, closeButton: false })
        .setHTML('<div style="font-family:sans-serif;font-size:12px;font-weight:700;color:#111">Persona</div>'))
      .addTo(map)
    markersRef.current.push(mP)
    bounds.extend([personCoords.lng, personCoords.lat])

    // Marcadores grupos
    results.slice(0, 6).forEach((g, i) => {
      const el = document.createElement('div')
      el.style.cssText =
        `width:28px;height:28px;background:${i === 0 ? '#3b82f6' : '#1e3a5f'};border-radius:50%;` +
        `border:2px solid ${i === 0 ? 'white' : 'rgba(59,130,246,0.5)'};` +
        `box-shadow:0 2px 8px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;` +
        `font-family:sans-serif;font-size:11px;font-weight:800;color:white;cursor:pointer`
      el.textContent = String(i + 1)
      const m = new maplibregl.Marker({ element: el })
        .setLngLat([g.coordinates.lng, g.coordinates.lat])
        .setPopup(new maplibregl.Popup({ offset: 18, closeButton: false }).setHTML(
          `<div style="font-family:sans-serif;font-size:12px;font-weight:700;color:#111">${g.name}${g.zone ? ' · ' + g.zone : ''}</div>` +
          `<div style="font-size:11px;color:#555;margin-top:2px">${formatDistance(g.distance)}</div>`
        ))
        .addTo(map)
      markersRef.current.push(m)
      bounds.extend([g.coordinates.lng, g.coordinates.lat])
    })

    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 55, maxZoom: 14, duration: 800 })
  }, [results, personCoords])

  async function handleSearch() {
    if (!street.trim() && !neighborhood.trim()) return
    setSearching(true)
    setSuggestions(null)
    try {
      const data = await searchAddress(neighborhood, street, city)
      if (!data.length) {
        toastError('No se encontró la dirección. Intenta con el barrio o la calle principal.')
        setSearching(false)
        return
      }
      if (data.length === 1) {
        // Una sola coincidencia → usar directamente
        applyCoords({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) })
      } else {
        // Varias → mostrar sugerencias para que el usuario confirme
        setSuggestions(data)
      }
    } catch {
      toastError('Error al buscar. Verifica tu conexión.')
    }
    setSearching(false)
  }

  function applyCoords(coords) {
    setPersonCoords(coords)
    setSuggestions(null)
    const withDist = allGroups
      .map(g => ({ ...g, distance: haversine(coords.lat, coords.lng, g.coordinates.lat, g.coordinates.lng) }))
      .sort((a, b) => a.distance - b.distance)
    setResults(withDist)
  }

  function handleClear() {
    setStreet(''); setNeighborhood(''); setCity(DEFAULT_CITY)
    setResults(null); setPersonCoords(null); setSuggestions(null)
    if (mapRef.current) mapRef.current.flyTo({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM })
  }

  async function doSignOut() {
    await signOut(auth)
    ok('Sesión cerrada')
    navigate('/login')
  }

  const canSearch = (street.trim() || neighborhood.trim()) && city.trim()

  return (
    <div className="flex flex-col min-h-dvh" style={{ background: 'var(--bg)' }}>

      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <div>
          <h1 className="font-syne font-extrabold text-[17px]" style={{ color: 'var(--text)' }}>Consolidación</h1>
          <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>Grupos Familiares</p>
        </div>
        {isConsolidacion && (
          <div className="flex items-center gap-2">
            <Link to="/grupos-familiares"
              className="w-9 h-9 flex items-center justify-center rounded-[10px] press"
              style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--accent)' }}>
              <Gear size={18} />
            </Link>
            <button onClick={() => setConfirmOut(true)}
              className="w-9 h-9 flex items-center justify-center rounded-[10px] press"
              style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
              <SignOut size={18} />
            </button>
          </div>
        )}
      </div>

      {/* Formulario */}
      <div className="px-4 pt-4 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex flex-col gap-2">

          {/* Ciudad */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--accent)' }}>Ciudad</label>
            <input
              className="w-full rounded-[10px] px-4 py-2.5 text-sm font-medium outline-none"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit' }}
              onFocus={e => e.target.style.borderColor = 'var(--accent)'}
              onBlur={e  => e.target.style.borderColor = 'var(--border)'}
              value={city} onChange={e => setCity(e.target.value)}
              placeholder="Soledad"
            />
          </div>

          {/* Barrio */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--accent)' }}>
              Barrio 
            </label>
            <input
              className="w-full rounded-[10px] px-4 py-2.5 text-sm font-medium outline-none"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit' }}
              onFocus={e => e.target.style.borderColor = 'var(--accent)'}
              onBlur={e  => e.target.style.borderColor = 'var(--border)'}
              value={neighborhood} onChange={e => setNeighborhood(e.target.value)}
              placeholder="Ej: Centenario, Hipodromo..."
              autoCapitalize="words"
            />
          </div>

          {/* Dirección */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--accent)' }}>
              Dirección 
            </label>
            <input
              className="w-full rounded-[10px] px-4 py-2.5 text-sm font-medium outline-none"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit' }}
              onFocus={e => e.target.style.borderColor = 'var(--accent)'}
              onBlur={e  => e.target.style.borderColor = 'var(--border)'}
              value={street} onChange={e => setStreet(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && canSearch && handleSearch()}
              placeholder="Ej: Cra 15 #20-40"
            />
          </div>

          {/* Botones */}
          <div className="flex gap-2 mt-1">
            <button onClick={handleSearch} disabled={searching || !canSearch}
              className="flex-1 h-11 flex items-center justify-center gap-2 rounded-[10px] text-sm font-bold press"
              style={{ background: 'var(--accent-g)', color: 'white', opacity: (!canSearch || searching) ? 0.5 : 1 }}>
              {searching
                ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin-slow" />
                : <><MagnifyingGlass size={17} weight="bold" /> Buscar grupos</>
              }
            </button>
            {(personCoords || results) && (
              <button onClick={handleClear}
                className="h-11 px-3 rounded-[10px] press"
                style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Panel de sugerencias */}
        {suggestions && suggestions.length > 0 && (
          <div className="mt-3 rounded-[12px] overflow-hidden animate-slide-up"
            style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
            <p className="px-4 pt-3 pb-1.5 text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--amber)' }}>
              ¿Cuál es la ubicación correcta?
            </p>
            {suggestions.map((s, i) => (
              <button key={i} onClick={() => applyCoords({ lat: parseFloat(s.lat), lng: parseFloat(s.lon) })}
                className="w-full flex items-start gap-3 px-4 py-3 text-left press"
                style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                <MapPin size={16} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }} />
                <span className="text-sm" style={{ color: 'var(--text)' }}>{s.display_name}</span>
              </button>
            ))}
            <button onClick={() => setSuggestions(null)}
              className="w-full py-2.5 text-sm font-semibold press"
              style={{ borderTop: '1px solid var(--border)', color: 'var(--text-3)' }}>
              Cancelar
            </button>
          </div>
        )}
      </div>

      {/* Mapa */}
      <div ref={mapContainerRef} style={{ height: '220px', width: '100%', flexShrink: 0, borderBottom: '1px solid var(--border)' }} />

      {/* Resultados */}
      <div className="flex-1 px-4 py-4 pb-8">
        {results === null ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <div className="w-14 h-14 rounded-[18px] flex items-center justify-center"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
              <MapTrifold size={28} style={{ color: 'var(--text-3)' }} />
            </div>
            <p className="text-sm font-semibold text-center" style={{ color: 'var(--text-3)' }}>
              Ingresa la ubicación para ver<br />los grupos más cercanos
            </p>
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <Users size={32} style={{ color: 'var(--text-3)' }} />
            <p className="text-sm text-center" style={{ color: 'var(--text-2)' }}>No hay grupos con ubicación registrada.</p>
          </div>
        ) : (
          <>
            <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-3)' }}>
              Grupos más cercanos
            </p>
            <div className="flex flex-col gap-3">
              {results.map((g, i) => <GroupCard key={g.id} group={g} rank={i + 1} />)}
            </div>
          </>
        )}
      </div>

      {/* Confirm sign out */}
      {confirmOut && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-6 animate-fade-in"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
          onClick={() => setConfirmOut(false)}>
          <div className="w-full max-w-sm rounded-[22px] p-6 animate-scale-in"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}
            onClick={e => e.stopPropagation()}>
            <h2 className="font-syne font-extrabold text-[18px] mb-1" style={{ color: 'var(--text)' }}>Cerrar sesión</h2>
            <p className="text-sm mb-6" style={{ color: 'var(--text-2)' }}>¿Seguro que quieres salir?</p>
            <div className="flex flex-col gap-2">
              <button onClick={doSignOut} className="w-full py-3 rounded-[12px] text-sm font-bold press"
                style={{ background: 'var(--red)', color: 'white' }}>Sí, salir</button>
              <button onClick={() => setConfirmOut(false)} className="w-full py-3 rounded-[12px] text-sm font-bold press"
                style={{ background: 'var(--card)', color: 'var(--text)' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function GroupCard({ group: g, rank }) {
  const isFirst = rank === 1
  return (
    <div className="rounded-[14px] p-4"
      style={{ background: 'var(--surface)', border: `1px solid ${isFirst ? 'rgba(59,130,246,0.35)' : 'var(--border)'}` }}>
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 font-bold text-sm"
          style={{ background: isFirst ? 'var(--accent)' : 'var(--card)', color: isFirst ? 'white' : 'var(--text-2)' }}>
          {rank}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm leading-tight" style={{ color: 'var(--text)' }}>
            {g.name}{g.zone ? ` · ${g.zone}` : ''}
          </p>
          <p className="text-xs mt-0.5 font-semibold" style={{ color: isFirst ? 'var(--accent)' : 'var(--text-2)' }}>
            {formatDistance(g.distance)} de distancia
          </p>
          {g.address && (
            <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--text-3)' }}>{g.address}</p>
          )}
        </div>
      </div>
      {(g.leaders || []).filter(l => l.name).length > 0 && (
        <div className="mt-3 pt-3 flex flex-col gap-2.5" style={{ borderTop: '1px solid var(--border)' }}>
          {g.leaders.filter(l => l.name).map((l, j) => (
            <div key={j} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-extrabold"
                  style={{ background: 'var(--card)', color: 'var(--accent)' }}>
                  {l.name[0]?.toUpperCase()}
                </div>
                <span className="text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{l.name}</span>
              </div>
              {l.phone && (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <a href={`https://wa.me/${l.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
                    className="h-7 px-2.5 flex items-center gap-1 rounded-[8px] text-[11px] font-bold press"
                    style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)' }}>
                    <WhatsappLogo size={13} weight="fill" /> WhatsApp
                  </a>
                  <a href={`tel:${l.phone}`}
                    className="w-7 h-7 flex items-center justify-center rounded-[8px] press"
                    style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                    <Phone size={13} />
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
