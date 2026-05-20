import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import LoadingSpinner from '../ui/LoadingSpinner'
import BottomNav from './BottomNav'

export default function ProtectedRoute({ children, roles }) {
  const { user, profile, loading, hasUsers } = useAuth()

  if (loading) return <LoadingSpinner fullScreen />

  // No users exist → setup first admin
  if (hasUsers === false) return <Navigate to="/setup" replace />

  // Not logged in → login
  if (!user) return <Navigate to="/login" replace />

  // Logged in but no profile doc (shouldn't happen normally)
  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh gap-4 px-6 text-center"
        style={{ background: 'var(--bg)' }}>
        <p className="text-sm font-semibold" style={{ color: 'var(--text-2)' }}>
          Tu cuenta no tiene un perfil asociado. Contacta al administrador.
        </p>
      </div>
    )
  }

  // Consolidacion users: redirect to /consolidacion if they try to access other routes
  if (profile.role === 'consolidacion' && !roles?.includes('consolidacion')) {
    return <Navigate to="/consolidacion" replace />
  }

  // Role check
  if (roles && !roles.includes(profile.role)) {
    return <Navigate to="/" replace />
  }

  // Account inactive
  if (profile.active === false) {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh gap-4 px-6 text-center"
        style={{ background: 'var(--bg)' }}>
        <p className="text-sm font-semibold" style={{ color: 'var(--amber)' }}>
          Tu cuenta está inactiva. Contacta al administrador.
        </p>
      </div>
    )
  }

  // Consolidacion users get a minimal layout (no nav, no sidebar)
  if (profile.role === 'consolidacion') {
    return (
      <div className="flex flex-col min-h-dvh" style={{ background: 'var(--bg)' }}>
        {children}
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-dvh" style={{ background: 'var(--bg)' }}>
      <div className="flex-1 pb-20 md:pb-0 md:ml-[200px]">
        <div className="md:max-w-[900px] md:mx-auto">
          {children}
        </div>
      </div>
      <BottomNav />
    </div>
  )
}
