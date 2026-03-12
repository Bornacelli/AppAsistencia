import { useAuth } from '../context/AuthContext'
import TopBar from '../components/layout/TopBar'
import Avatar from '../components/ui/Avatar'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { useNotifications } from '../hooks/useNotifications'
import { Bell, BellSlash } from '@phosphor-icons/react'

const ROLE_LABEL = {
  super_admin: 'Super Administrador',
  admin:       'Administrador',
  leader:      'Líder',
  assistant:   'Asistente',
}

export default function Profile() {
  const { profile } = useAuth()
  const { permission, isActive, isSupported, loading, enable, disable } = useNotifications()

  if (!profile) return <LoadingSpinner fullScreen />

  const handleToggle = () => { isActive ? disable() : enable() }

  return (
    <div className="flex flex-col" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      <TopBar title="Mi perfil" />

      <div className="px-4 py-6 flex flex-col gap-4">

        {/* Info del usuario */}
        <div className="rounded-[var(--r)] p-5 flex flex-col items-center gap-3 text-center"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <Avatar name={profile.name} size={72} />
          <div>
            <h2 className="font-syne font-extrabold text-lg" style={{ color: 'var(--text)' }}>
              {profile.name?.toUpperCase()}
            </h2>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-2)' }}>{profile.email}</p>
          </div>
          <span className="text-xs font-bold px-3 py-1.5 rounded-full"
            style={{ background: 'rgba(59,130,246,0.12)', color: 'var(--accent)', border: '1px solid rgba(59,130,246,0.2)' }}>
            {ROLE_LABEL[profile.role] || profile.role}
          </span>
        </div>

        {/* Notificaciones */}
        <div className="rounded-[var(--r)] overflow-hidden"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-[11px] font-bold uppercase tracking-widest px-4 pt-4 pb-2"
            style={{ color: 'var(--text-2)' }}>
            Notificaciones push
          </p>

          {!isSupported ? (
            <p className="px-4 pb-4 text-sm" style={{ color: 'var(--text-2)' }}>
              Tu navegador no soporta notificaciones push.
            </p>

          ) : permission === 'denied' ? (
            <div className="flex items-start gap-3 px-4 pb-4">
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Notificaciones bloqueadas</p>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-2)' }}>
                  Las bloqueaste en el navegador. Para activarlas ve a{' '}
                  <strong>Configuración del navegador → Privacidad → Notificaciones</strong>{' '}
                  y permite este sitio.
                </p>
              </div>
            </div>

          ) : (
            <button
              onClick={handleToggle}
              disabled={loading}
              className="flex items-center gap-3 px-4 py-3.5 w-full text-left press"
              style={{ opacity: loading ? 0.6 : 1 }}>
              <div className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0"
                style={{
                  background: isActive ? 'rgba(59,130,246,0.12)' : 'var(--card)',
                  color: isActive ? 'var(--accent)' : 'var(--text-3)',
                }}>
                {isActive ? <Bell size={18} weight="fill" /> : <BellSlash size={18} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                  {isActive ? 'Notificaciones activadas' : 'Notificaciones desactivadas'}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>
                  {isActive
                    ? 'Recibirás alertas de ausencias y cumpleaños cada lunes'
                    : 'Toca para recibir alertas de tu grupo'}
                </p>
              </div>
              {/* Toggle */}
              <div className="w-11 h-6 rounded-full flex-shrink-0 flex items-center px-0.5"
                style={{
                  background: isActive ? 'var(--accent)' : 'var(--text-3)',
                  transition: 'background 0.2s',
                }}>
                <div className="w-5 h-5 rounded-full bg-white"
                  style={{
                    transform: isActive ? 'translateX(20px)' : 'translateX(0)',
                    transition: 'transform 0.2s',
                  }} />
              </div>
            </button>
          )}

          {/* Nota iOS */}
          <p className="px-4 pb-3 text-[11px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
            En iPhone las notificaciones solo funcionan si instalas la app en tu pantalla de inicio.
          </p>
        </div>

      </div>
    </div>
  )
}
