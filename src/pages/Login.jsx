import { useState, useEffect } from 'react'
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '../firebase'
import { useToast } from '../context/ToastContext'
import { Cross, Eye, EyeSlash, ArrowRight, EnvelopeSimple } from '@phosphor-icons/react'

export default function Login() {
  const { ok, error: toastError } = useToast()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [resetMode, setResetMode] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})

  useEffect(() => {
    const reason = localStorage.getItem('auth_error')
    if (reason === 'no_profile') {
      localStorage.removeItem('auth_error')
      toastError('Esta cuenta no tiene acceso. Contacta al administrador.')
    }
  }, [])

  const handleLogin = async (e) => {
    e.preventDefault()
    const errors = {}
    if (!email.trim())    errors.email    = 'Escribe tu correo'
    if (!password.trim()) errors.password = 'Escribe tu contraseña'
    if (Object.keys(errors).length) { setFieldErrors(errors); return }

    setLoading(true)
    setFieldErrors({})
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
    } catch (err) {
      const msg = err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password'
        ? 'Correo o contraseña incorrectos'
        : err.code === 'auth/user-not-found'
        ? 'No existe una cuenta con este correo'
        : err.code === 'auth/too-many-requests'
        ? 'Demasiados intentos. Espera un momento.'
        : 'Error al iniciar sesión'
      toastError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleReset = async (e) => {
    e.preventDefault()
    if (!email.trim()) { setFieldErrors({ email: 'Escribe tu correo' }); return }
    setLoading(true)
    try {
      await sendPasswordResetEmail(auth, email.trim())
      ok('Correo de recuperación enviado')
      setResetMode(false)
    } catch {
      toastError('No se pudo enviar el correo. Verifica la dirección.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col min-h-dvh items-center justify-center px-6 py-12" style={{ background: 'var(--bg)' }}>
      {/* Logo */}
      <div className="flex flex-col items-center gap-4 mb-10">
        <div
          className="w-16 h-16 rounded-[18px] flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(99,102,241,0.15))', border: '1px solid rgba(99,102,241,0.25)' }}
        >
          <Cross size={28} style={{ color: '#818cf8' }} />
        </div>
        <div className="text-center">
          <h1 className="font-syne font-extrabold text-3xl" style={{ color: 'var(--text)' }}>
            {resetMode ? 'Recuperar acceso' : 'Bienvenido'}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
            {resetMode ? 'Te enviaremos un correo para restablecer tu contraseña' : 'Asistencia CIC'}
          </p>
        </div>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm">
        <form onSubmit={resetMode ? handleReset : handleLogin} className="flex flex-col gap-4">

          {/* Email */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--accent)' }}>
              Correo electrónico
            </label>
            <div
              className="flex items-center gap-2 rounded-[12px] px-4"
              style={{ background: 'var(--surface)', border: `1px solid ${fieldErrors.email ? 'var(--red)' : 'var(--border)'}`, transition: 'border-color 0.2s' }}
              onFocusCapture={e => e.currentTarget.style.borderColor = fieldErrors.email ? 'var(--red)' : 'var(--accent)'}
              onBlurCapture={e  => e.currentTarget.style.borderColor = fieldErrors.email ? 'var(--red)' : 'var(--border)'}
            >
              <EnvelopeSimple size={18} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                autoCapitalize="none"
                autoComplete="email"
                className="flex-1 bg-transparent py-3.5 text-sm font-medium outline-none"
                style={{ color: 'var(--text)', fontFamily: 'inherit' }}
              />
            </div>
            {fieldErrors.email && <p className="text-xs" style={{ color: 'var(--red)' }}>{fieldErrors.email}</p>}
          </div>

          {/* Password (only in login mode) */}
          {!resetMode && (
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--accent)' }}>
                Contraseña
              </label>
              <div
                className="flex items-center gap-2 rounded-[12px] px-4"
                style={{ background: 'var(--surface)', border: `1px solid ${fieldErrors.password ? 'var(--red)' : 'var(--border)'}`, transition: 'border-color 0.2s' }}
                onFocusCapture={e => e.currentTarget.style.borderColor = fieldErrors.password ? 'var(--red)' : 'var(--accent)'}
                onBlurCapture={e  => e.currentTarget.style.borderColor = fieldErrors.password ? 'var(--red)' : 'var(--border)'}
              >
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="flex-1 bg-transparent py-3.5 text-sm font-medium outline-none"
                  style={{ color: 'var(--text)', fontFamily: 'inherit' }}
                />
                <button type="button" onClick={() => setShowPw(!showPw)} className="press-sm">
                  {showPw ? <EyeSlash size={18} style={{ color: 'var(--text-3)' }} /> : <Eye size={18} style={{ color: 'var(--text-3)' }} />}
                </button>
              </div>
              {fieldErrors.password && <p className="text-xs" style={{ color: 'var(--red)' }}>{fieldErrors.password}</p>}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="h-14 rounded-[14px] font-bold text-[15px] flex items-center justify-center gap-2 mt-2 press"
            style={{ background: 'var(--accent-g)', color: 'white', boxShadow: '0 4px 20px rgba(59,130,246,0.28)' }}
          >
            {loading ? (
              <span className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin-slow" />
            ) : (
              <>
                {resetMode ? 'Enviar correo' : 'Iniciar sesión'}
                <ArrowRight size={20} weight="bold" />
              </>
            )}
          </button>
        </form>

        {/* Forgot password toggle */}
        {/*<div className="text-center mt-6">
          <button
            onClick={() => { setResetMode(!resetMode); setFieldErrors({}) }}
            className="text-sm font-semibold press"
            style={{ color: 'var(--accent)' }}
          >
            {resetMode ? '← Volver al login' : '¿Olvidaste tu contraseña?'}
          </button>
        </div>*/}
      </div>
    </div>
  )
}
