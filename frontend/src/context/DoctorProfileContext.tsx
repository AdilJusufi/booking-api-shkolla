import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from '../lib/api'
import type { DoctorSelfProfile } from '../lib/types'

interface DoctorProfileContextValue {
  profile: DoctorSelfProfile | null
  failed: boolean
  reload: () => void
  /** Pas ngarkimit/heqjes — avatari në header ndryshon menjëherë, pa rifreskim. */
  setPhotoUrl: (photoUrl: string | null) => void
}

const DoctorProfileContext = createContext<DoctorProfileContextValue | null>(null)

/** Profili i mjekut të kyçur, i përbashkët mes DoctorLayout (avatari) dhe faqes "Profili im". */
export function DoctorProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<DoctorSelfProfile | null>(null)
  const [failed, setFailed] = useState(false)

  const reload = useCallback(() => {
    setFailed(false)
    api
      .getMyDoctorProfile()
      .then(setProfile)
      .catch(() => setFailed(true))
  }, [])

  useEffect(reload, [reload])

  const setPhotoUrl = useCallback((photoUrl: string | null) => {
    setProfile((prev) => (prev ? { ...prev, photoUrl: photoUrl ?? undefined } : prev))
  }, [])

  return (
    <DoctorProfileContext.Provider value={{ profile, failed, reload, setPhotoUrl }}>
      {children}
    </DoctorProfileContext.Provider>
  )
}

/** Null jashtë panelit të mjekut. */
export function useDoctorProfile(): DoctorProfileContextValue | null {
  return useContext(DoctorProfileContext)
}
