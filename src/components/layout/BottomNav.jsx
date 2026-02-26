import { House, ClipboardText, Users, Bell, DotsThreeOutline, ChartBar, Gear, UserCircle, CalendarBlank, Cake } from '@phosphor-icons/react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { signOut } from 'firebase/auth'
import { auth } from '../../firebase'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'

function NavItem({ to, icon: Icon, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex flex-col items-center gap-1 flex-1 py-2 transition-colors ${isActive ? '' : ''}`
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            size={24}
            weight={isActive ? 'fill' : 'regular'}
            style={{ color: isActive ? 'var(--accent)' : 'var(--text-3)', transition: 'color 0.15s' }}
          />
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
  const [moreOpen, setMoreOpen] = useState(false)

  const isSuperAdmin = profile?.role === 'super_admin'
  const isAdmin      = profile?.role === 'admin' || isSuperAdmin
  const isLeader     = profile?.role === 'leader'

  const handleSignOut = async () => {
    await signOut(auth)
    ok('Sesión cerrada')
    navigate('/login')
    setMoreOpen(false)
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
        <NavItem to="/alerts"     icon={Bell}           label="Alertas" />

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
          className="fixed inset-0 z-[90] animate-fade-in"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="absolute bottom-0 left-0 right-0 rounded-t-[24px] p-5 animate-slide-up"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: 'var(--text-3)' }} />
            <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-2)' }}>
              Más opciones
            </p>

            <div className="flex flex-col gap-1">
              <MoreItem icon={CalendarBlank} label="Reuniones"    to="/meetings"   onClose={() => setMoreOpen(false)} />
              <MoreItem icon={ChartBar}      label="Historial"    to="/history"    onClose={() => setMoreOpen(false)} />
              <MoreItem icon={Cake}          label="Cumpleaños"   to="/birthdays"  onClose={() => setMoreOpen(false)} />
              {isAdmin            && <MoreItem icon={UserCircle} label="Líderes"       to="/leaders"  onClose={() => setMoreOpen(false)} />}
              {(isAdmin || isLeader) && <MoreItem icon={ChartBar}   label="Reportes"      to="/reports"  onClose={() => setMoreOpen(false)} />}
              {isAdmin            && <MoreItem icon={Gear}        label="Configuración" to="/settings" onClose={() => setMoreOpen(false)} />}

              <div className="my-2" style={{ borderTop: '1px solid var(--border)' }} />

              <button
                onClick={handleSignOut}
                className="flex items-center gap-3 px-4 py-3 rounded-[12px] w-full text-left press"
                style={{ color: 'var(--red)' }}
              >
                <span className="text-sm font-semibold">Cerrar sesión</span>
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
