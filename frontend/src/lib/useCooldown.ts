import { useEffect, useRef, useState } from 'react'

// The backend's "auth" rate-limit policy is a 1-minute fixed window
// (10 requests/min, no Retry-After header) — 60s is the worst-case wait,
// not an exact one, since a fixed window can reset sooner than a full minute
// after the limiting request.
const COOLDOWN_SECONDS = 60

/** Disables an action for a fixed window after a 429, with a visible countdown. */
export function useCooldown() {
  const [secondsLeft, setSecondsLeft] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  function start() {
    setSecondsLeft(COOLDOWN_SECONDS)
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  return { secondsLeft, startCooldown: start }
}
