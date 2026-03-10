import { House, ClipboardText, Users, Bell, DotsThreeOutline, ChartBar, Gear, UserCircle, CalendarBlank, Cake, Warning, IdentificationCard } from '@phosphor-icons/react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { signOut } from 'firebase/auth'
import { auth } from '../../firebase'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useAlerts } from '../../context/AlertContext'

function NavItem({ to, icon: Icon, label, badge }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex flex-col items-center gap-1 flex-1 py-2 transition-colors ${isActive ? '' : ''}`
      }
    >
      {({ isActive }) => (
        <>
          <div className="relative">
            <Icon
              size={24}
              weight={isActive ? 'fill' : 'regular'}
              style={{ color: isActive ? 'var(--accent)' : 'var(--text-3)', transition: 'color 0.15s' }}
            />
            {badge > 0 && (
              <span
                className="absolute -top-1 -right-1.5 min-w-[16px] h-4 px-[3px] rounded-full text-[9px] font-extrabold flex items-center justify-center"
                style={{ background: 'var(--red)', color: 'white', lineHeight: 1 }}
              >
                {badge > 9 ? '9+' : badge}
              </span>
            )}
          </div>
          <span
            className="text-[10px] font-bold tracking-wide"
            style={{ color: isActive ? 'var(--accent)' : 'var(--text-3)', transition: 'color 0.15s' }}
          >
            {label}
          </span>
        </>
      )}
    </NavLink>
  )
}

export default function BottomNav() {
  const { profile } = useAuth()
  const { ok } = useToast()
  const navigate = useNavigate()
  const [moreOpen,       setMoreOpen]       = useState(false)
  const [closing,        setClosing]        = useState(false)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const { alertCount } = useAlerts()

  const isSuperAdmin = profile?.role === 'super_admin'
  const isAdmin      = profile?.role === 'admin' || isSuperAdmin
  const isLeader     = profile?.role === 'leader'

  function closeDrawer() {
    setClosing(true)
    setTimeout(() => {
      setMoreOpen(false)
      setClosing(false)
      setConfirmSignOut(false)
    }, 260)
  }

  const handleSignOut = async () => {
    setConfirmSignOut(false)
    setMoreOpen(false)
    await signOut(auth)
    ok('Sesión cerrada')
    navigate('/login')
  }

  return (
    <>
      {/* Bottom Nav Bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 flex items-stretch"
        style={{
          background: 'var(--surface)',
          borderTop: '1px solid var(--border)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <NavItem to="/"           icon={House}         label="Inicio" />
        <NavItem to="/attendance" icon={ClipboardText}  label="Asistencia" />
        <NavItem to="/members"    icon={Users}          label="Miembros" />
        <NavItem to="/alerts"     icon={Bell}           label="Alertas" badge={alertCount} />

        {/* More button */}
        <button
          onClick={() => setMoreOpen(true)}
          className="flex flex-col items-center gap-1 flex-1 py-2"
        >
          <DotsThreeOutline size={24} style={{ color: 'var(--text-3)' }} />
          <span className="text-[10px] font-bold tracking-wide" style={{ color: 'var(--text-3)' }}>Más</span>
        </button>
      </nav>

      {/* More Drawer */}
      {moreOpen && (
        <div
          className={`fixed inset-0 z-[90] ${closing ? 'animate-fade-out' : 'animate-fade-in'}`}
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={closeDrawer}
        >
          <div
            className={`absolute bottom-0 left-0 right-0 rounded-t-[24px] p-5 ${closing ? 'animate-slide-down' : 'animate-slide-up'}`}
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Handle — toca para cerrar */}
            <button
              onClick={closeDrawer}
              className="flex items-center justify-center w-full -mt-1 mb-4 py-2"
              aria-label="Cerrar menú"
            >
              <div className="w-10 h-1 rounded-full" style={{ background: 'var(--text-3)' }} />
            </button>

            <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-2)' }}>
              Más opciones
            </p>

            <div className="flex flex-col gap-1">
              <MoreItem icon={CalendarBlank} label="Reuniones"     to="/meetings"   onClose={closeDrawer} />
              <MoreItem icon={ChartBar}      label="Historial"     to="/history"    onClose={closeDrawer} />
              <MoreItem icon={Cake}          label="Cumpleaños"    to="/birthdays"  onClose={closeDrawer} />
              <MoreItem icon={Warning}       label="Inasistencias" to="/absences"   onClose={closeDrawer} />
              {isAdmin               && <MoreItem icon={UserCircle} label="Líderes"       to="/leaders"  onClose={closeDrawer} />}
              {(isAdmin || isLeader) && <MoreItem icon={ChartBar}   label="Reportes"      to="/reports"  onClose={closeDrawer} />}
              {isAdmin               && <MoreItem icon={Gear}       label="Configuración" to="/settings" onClose={closeDrawer} />}
              <MoreItem icon={IdentificationCard} label="Mi perfil" to="/profile" onClose={closeDrawer} />

              <div className="my-2" style={{ borderTop: '1px solid var(--border)' }} />

              <button
                onClick={() => setConfirmSignOut(true)}
                className="flex items-center gap-3 px-4 py-3 rounded-[12px] w-full text-left press"
                style={{ color: 'var(--red)' }}
              >
                <span className="text-sm font-semibold">Cerrar sesión</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sign-out confirm modal */}
      {confirmSignOut && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center px-6 animate-fade-in"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
          onClick={() => setConfirmSignOut(false)}
        >
          <div
            className="w-full max-w-sm rounded-[22px] p-6 animate-scale-in"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}
            onClick={e => e.stopPropagation()}
          >
            <h2 className="font-syne font-extrabold text-[18px] mb-1" style={{ color: 'var(--text)' }}>
              Cerrar sesión
            </h2>
            <p className="text-sm mb-6" style={{ color: 'var(--text-2)' }}>
              ¿Seguro que quieres cerrar sesión?
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleSignOut}
                className="w-full py-3 rounded-[12px] text-sm font-bold press"
                style={{ background: 'var(--red)', color: 'white' }}
              >
                Sí, cerrar sesión
              </button>
              <button
                onClick={() => setConfirmSignOut(false)}
                className="w-full py-3 rounded-[12px] text-sm font-bold press"
                style={{ background: 'var(--card)', color: 'var(--text)' }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function MoreItem({ icon: Icon, label, to, onClose }) {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => { navigate(to); onClose() }}
      className="flex items-center gap-3 px-4 py-3 rounded-[12px] w-full text-left press"
      style={{ color: 'var(--text)' }}
    >
      <div className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0"
        style={{ background: 'var(--card)', color: 'var(--accent)' }}>
        <Icon size={18} />
      </div>
      <span className="text-sm font-semibold">{label}</span>
    </button>
  )
}
