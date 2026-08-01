import { createContext, useContext, useState, type ReactNode } from 'react'

/** Segmenti i fundit dinamik i breadcrumb-it (p.sh. emri i klinikës së hapur). */
interface AdminBreadcrumbContextValue {
  trail: string[]
  setTrail: (trail: string[]) => void
}

const AdminBreadcrumbContext = createContext<AdminBreadcrumbContextValue | null>(null)

export function AdminBreadcrumbProvider({ children }: { children: ReactNode }) {
  const [trail, setTrail] = useState<string[]>([])
  return (
    <AdminBreadcrumbContext.Provider value={{ trail, setTrail }}>
      {children}
    </AdminBreadcrumbContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAdminBreadcrumb(): AdminBreadcrumbContextValue {
  const ctx = useContext(AdminBreadcrumbContext)
  if (!ctx) throw new Error('useAdminBreadcrumb duhet përdorur brenda AdminBreadcrumbProvider')
  return ctx
}
