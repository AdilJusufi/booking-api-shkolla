import { createContext, useContext, useState, type ReactNode } from 'react'

interface DoctorSearchContextValue {
  searchTerm: string
  setSearchTerm: (value: string) => void
}

const DoctorSearchContext = createContext<DoctorSearchContextValue | null>(null)

export function DoctorSearchProvider({ children }: { children: ReactNode }) {
  const [searchTerm, setSearchTerm] = useState('')
  return (
    <DoctorSearchContext.Provider value={{ searchTerm, setSearchTerm }}>
      {children}
    </DoctorSearchContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDoctorSearch(): DoctorSearchContextValue {
  const ctx = useContext(DoctorSearchContext)
  if (!ctx) throw new Error('useDoctorSearch duhet përdorur brenda DoctorSearchProvider')
  return ctx
}
