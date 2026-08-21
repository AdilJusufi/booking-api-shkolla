import { useEffect, useState } from 'react'

/**
 * Tracks browser connectivity.
 *
 * `navigator.onLine` is a coarse signal — it reports whether there is a network
 * interface, not whether the API is reachable — so it is used only to explain
 * failures to the user, never to decide whether a request should be attempted.
 * Requests are always made; the API layer surfaces the real outcome.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  )

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return online
}
