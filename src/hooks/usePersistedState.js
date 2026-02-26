import { useState } from 'react'

/**
 * Like useState but persists the value to localStorage.
 * Restores the last value automatically on mount.
 */
export function usePersistedState(key, defaultValue) {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw !== null ? JSON.parse(raw) : defaultValue
    } catch {
      return defaultValue
    }
  })

  function set(value) {
    setState(value)
    try {
      if (value === null || value === undefined || value === defaultValue) {
        localStorage.removeItem(key)
      } else {
        localStorage.setItem(key, JSON.stringify(value))
      }
    } catch {}
  }

  return [state, set]
}
