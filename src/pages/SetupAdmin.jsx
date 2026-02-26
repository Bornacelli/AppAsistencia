import { useState, useEffect } from 'react'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { doc, setDoc, getDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Cross, ShieldCheck } from '@phosphor-icons/react'

export default function SetupAdmin() {
  const { hasUsers, user } = useAuth()
  const navigate = useNavigate()
  const [name,     setName]     = useState('')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [done,     setDone]     = useState(false)

  useEffect(() => {
    if (hasUsers === true && user)  navigate('/', { replace: true })
    if (hasUsers === true && !user) navigate('/login', { replace: true })
  }, [hasUsers, user, navigate])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!name.trim() || !email.trim() || password.length < 6) {
      setError('Completa todos los campos. La contraseña debe tener al menos 6 caracteres.')
      return
    }
    setLoading(true)
    setError('')
    try {
      // 1. Create Firebase Auth user
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password)

      // 2. Write the admin profile in Firestore
      await setDoc(doc(db, 'leaders', cred.user.uid), {
        name:      name.trim(),
        email:     email.trim().toLowerCase(),
        role:      'super_admin',
        groupIds:  [],
        active:    true,
        createdAt: new Date().toISOString(),
      })

      // 3. Mark the app as initialized (publicly readable, used for setup detection)
      await setDoc(doc(db, 'config', 'general'), {
        initialized:  true,
        churchName:   '',
        meetingDayName: '',
        absenceAlertWeeks: 2,
        createdAt:    new Date().toISOString(),
      }, { merge: true })

      setDone(true)
    } catch (err) {
      console.error('Setup error:', err.code, err.message)
      const msg = err.code === 'auth/email-already-in-use'
        ? 'Este correo ya está en uso en Firebase'
        : err.code === 'auth/invalid-email'
        ? 'El correo ingresado no es válido'
        : err.code === 'auth/weak-password'
        ? 'La contraseña debe tener al menos 6 caracteres'
        : err.code === 'permission-denied' || err.code === 'auth/unauthorized-domain'
        ? 'Error de permisos. Revisa las reglas de Firestore y el dominio autorizado en Firebase.'
        : `Error: ${err.message || err.code}`
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh gap-6 px-6 text-center"
        style={{ background: 'var(--bg)' }}>
        <div className="w-20 h-20 rounded-full flex items-center justify-center animate-pop"
          style={{ background: 'var(--green-bg)', border: '2px solid var(--green-bdr)' }}>
          <ShieldCheck size={36} weight="fill" style={{ color: 'var(--green)' }} />
        </div>
        <div>
          <h1 className="font-syne font-extrabold text-2xl mb-2" style={{ color: 'var(--text)' }}>
            ¡Administrador creado!
          </h1>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-2)' }}>
            Tu cuenta de administrador está lista. Serás redirigido automáticamente.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-dvh items-center justify-center px-6 py-12"
      style={{ background: 'var(--bg)' }}>
      {/* Icon */}
      <div className="flex flex-col items-center gap-4 mb-8">
        <div className="w-16 h-16 rounded-[18px] flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(99,102,241,0.15))', border: '1px solid rgba(99,102,241,0.25)' }}>
          <Cross size={28} style={{ color: '#818cf8' }} />
        </div>
        <div className="text-center">
          <h1 className="font-syne font-extrabold text-2xl" style={{ color: 'var(--text)' }}>
            Primera configuración
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
            Crea la cuenta de administrador principal
          </p>
        </div>
      </div>

      <div className="w-full max-w-sm">
        {/* Info banner */}
        <div className="flex items-start gap-3 p-4 rounded-[12px] mb-6"
          style={{ background: 'var(--amber-bg)', border: '1px solid var(--amber-bdr)' }}>
          <ShieldCheck size={20} style={{ color: 'var(--amber)', flexShrink: 0, marginTop: 1 }} />
          <p className="text-xs leading-relaxed" style={{ color: 'var(--amber)' }}>
            Esta pantalla solo aparece una vez. Después, solo el administrador puede crear nuevas cuentas.
          </p>
        </div>

        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          {['Nombre completo', 'Correo electrónico', 'Contraseña'].map((lbl, i) => (
            <div key={lbl} className="flex flex-col gap-1">
              <label className="text-[11px] font-bold uppercase tracking-widest"
                style={{ color: 'var(--accent)' }}>
                {lbl}
              </label>
              <input
                type={i === 2 ? 'password' : i === 1 ? 'email' : 'text'}
                value={[name, email, password][i]}
                onChange={e => [setName, setEmail, setPassword][i](e.target.value)}
                placeholder={['Juan Pérez', 'admin@iglesia.com', 'Mínimo 6 caracteres'][i]}
                autoCapitalize={i === 0 ? 'words' : 'none'}
                autoComplete={i === 1 ? 'email' : i === 2 ? 'new-password' : 'name'}
                className="rounded-[12px] px-4 py-3.5 text-sm font-medium outline-none"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  fontFamily: 'inherit',
                }}
                onFocus={e => { e.target.style.borderColor = 'var(--accent)' }}
                onBlur={e  => { e.target.style.borderColor = 'var(--border)' }}
              />
            </div>
          ))}

          {error && (
            <p className="text-sm text-center p-3 rounded-[10px]"
              style={{ background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid var(--red-bdr)' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="h-14 rounded-[14px] font-bold text-[15px] flex items-center justify-center gap-2 mt-2 press"
            style={{ background: 'var(--accent-g)', color: 'white', boxShadow: '0 4px 20px rgba(59,130,246,0.28)' }}
          >
            {loading
              ? <span className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin-slow" />
              : 'Crear administrador'}
          </button>
        </form>
      </div>
    </div>
  )
}
