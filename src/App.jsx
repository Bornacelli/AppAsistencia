import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { onMessage } from 'firebase/messaging'
import { useAuth } from './context/AuthContext'
import ProtectedRoute from './components/layout/ProtectedRoute'
import Toast from './components/ui/Toast'
import LoadingSpinner from './components/ui/LoadingSpinner'
import { messaging } from './firebase'

import Login        from './pages/Login'
//import SetupAdmin   from './pages/SetupAdmin'
import Dashboard    from './pages/Dashboard'
import Attendance   from './pages/Attendance'
import Members      from './pages/Members'
import MemberForm   from './pages/MemberForm'
import MemberProfile from './pages/MemberProfile'
import Visitors     from './pages/Visitors'
import Leaders      from './pages/Leaders'
import History      from './pages/History'
import Reports      from './pages/Reports'
import Alerts       from './pages/Alerts'
import Settings     from './pages/Settings'
import Meetings     from './pages/Meetings'
import Birthdays    from './pages/Birthdays'
import Absences     from './pages/Absences'
import Profile      from './pages/Profile'

export default function App() {
  const { loading, user, hasUsers } = useAuth()

  // Notificaciones cuando la app está abierta (foreground)
  useEffect(() => {
    if (!messaging || Notification.permission !== 'granted') return
    const unsub = onMessage(messaging, payload => {
      const { title, body } = payload.notification || {}
      if (title) new Notification(title, { body, icon: '/pwa-192x192.png' })
    })
    return unsub
  }, [])

  if (loading) return <LoadingSpinner fullScreen />

  return (
    <>
      <Toast />
      <Routes>
        {/* Public */}
        <Route
          path="/login"
          element={user ? <Navigate to="/" replace /> : <Login />}
        />
        {/*<Route path="/setup" element={<SetupAdmin />} />*/}

        {/* Protected */}
        <Route path="/" element={
          <ProtectedRoute><Dashboard /></ProtectedRoute>
        } />
        <Route path="/attendance" element={
          <ProtectedRoute><Attendance /></ProtectedRoute>
        } />
        <Route path="/members" element={
          <ProtectedRoute><Members /></ProtectedRoute>
        } />
        <Route path="/members/new" element={
          <ProtectedRoute><MemberForm /></ProtectedRoute>
        } />
        <Route path="/members/:id/edit" element={
          <ProtectedRoute><MemberForm /></ProtectedRoute>
        } />
        <Route path="/members/:id" element={
          <ProtectedRoute><MemberProfile /></ProtectedRoute>
        } />
        <Route path="/visitors" element={
          <ProtectedRoute><Visitors /></ProtectedRoute>
        } />
        <Route path="/leaders" element={
          <ProtectedRoute roles={['super_admin', 'admin']}><Leaders /></ProtectedRoute>
        } />
        <Route path="/meetings" element={
          <ProtectedRoute><Meetings /></ProtectedRoute>
        } />
        <Route path="/birthdays" element={
          <ProtectedRoute><Birthdays /></ProtectedRoute>
        } />
        <Route path="/absences" element={
          <ProtectedRoute><Absences /></ProtectedRoute>
        } />
        <Route path="/history" element={
          <ProtectedRoute><History /></ProtectedRoute>
        } />
        <Route path="/reports" element={
          <ProtectedRoute roles={['super_admin', 'admin', 'leader']}><Reports /></ProtectedRoute>
        } />
        <Route path="/alerts" element={
          <ProtectedRoute><Alerts /></ProtectedRoute>
        } />
        <Route path="/settings" element={
          <ProtectedRoute roles={['super_admin', 'admin']}><Settings /></ProtectedRoute>
        } />

        <Route path="/profile" element={
          <ProtectedRoute><Profile /></ProtectedRoute>
        } />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
