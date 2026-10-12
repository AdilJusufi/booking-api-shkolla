import { useEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/**
 * Çon faqen në krye kur ndërrohet rruga.
 *
 * Pa këtë, hapja e një mjeku/klinike nga rezultatet e kërkimit e nis faqen e re
 * në të njëjtin pozicion vertikal si lista — pra diku në mes të përmbajtjes.
 *
 * Tri kufizime me qëllim:
 *  - Vetëm kur ndryshon `pathname`. Filtrat dhe faqosja e `/kerko` shkruhen te
 *    query-string me `setSearchParams`; një kërcim në krye për secilin do ta
 *    bënte të papërdorshëm filtrimin (dhe faqosja e ka scroll-in e vet).
 *  - Asnjëherë për `POP` (back/forward) — aty shfletuesi e rikthen vetë
 *    pozicionin e mëparshëm, dhe mbishkrimi ynë do ta prishte pikërisht
 *    sjelljen që përdoruesi pret nga butoni "prapa".
 *  - `behavior: 'instant'` — një scroll i animuar pas navigimit lexohet si
 *    faqe që "rrëshqet" vonë, dhe përplaset me scroll-in e vet të faqes.
 */
export default function ScrollToTop() {
  const { pathname } = useLocation()
  const navigationType = useNavigationType()
  const previousPathname = useRef(pathname)

  useEffect(() => {
    const changedRoute = previousPathname.current !== pathname
    previousPathname.current = pathname
    if (!changedRoute || navigationType === 'POP') return
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname, navigationType])

  return null
}
