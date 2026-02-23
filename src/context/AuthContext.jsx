import { createContext, useContext, useState, useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,     setUser]     = useState(null)
  const [profile,  setProfile]  = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [hasUsers, setHasUsers] = useState(null)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        // User is signed in — load their Firestore profile
        try {
          const snap = await getDoc(doc(db, 'leaders', fbUser.uid))
          if (snap.exists()) {
            setProfile({ uid: fbUser.uid, ...snap.data() })
          } else {
            setProfile(null)
          }
        } catch {
          setProfile(null)
        }
        setUser(fbUser)
        setHasUsers(true)
      } else {
        // Not signed in — check if the app has been initialized
        // by reading /config/general which is publicly readable
        setUser(null)
        setProfile(null)
        try {
          const cfgSnap = await getDoc(doc(db, 'config', 'general'))
          // If the document exists and has initialized:true, users exist
          if (cfgSnap.exists() && cfgSnap.data().initialized === true) {
            setHasUsers(true)
          } else {
            // Config doesn't exist yet → first time setup
            setHasUsers(false)
          }
        } catch {
          // If we can't read config at all, default to "users might exist"
          // to avoid accidentally showing the setup screen
          setHasUsers(false)
        }
      }
      setLoading(false)
    })
    return unsub
  }, [])

  const refreshProfile = async () => {
    if (!user) return
    try {
      const snap = await getDoc(doc(db, 'leaders', user.uid))
      if (snap.exists()) setProfile({ uid: user.uid, ...snap.data() })
    } catch {}
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, hasUsers, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
