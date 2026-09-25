import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import type { Specialty } from '../lib/types'

/**
 * Emrat e specializimeve vijnë nga baza, jo nga skedarët e përkthimit — një
 * SuperAdmin mund të shtojë një specializim të ri në çdo kohë, dhe një hartë e
 * ngurtë në klient do të thyhej pikërisht atëherë. Prandaj backend-i i dërgon
 * të tre emrat (`name`, `nameEn`, `nameSr`) dhe zgjedhja bëhet këtu.
 *
 * Pse në klient e jo me `Accept-Language`: ndërrimi i gjuhës nuk i rifreskon të
 * dhënat (efektet e kërkimit s'e kanë gjuhën te varësitë), prandaj po ta
 * zgjidhte serveri, emrat do të mbeteshin shqip derisa përdoruesi të navigonte.
 *
 * Çelësi është emri kanonik shqip, sepse DTO-të e doktorëve/shërbimeve e mbajnë
 * specializimin si string e jo si id — dhe `Specialty.Name` ka indeks unik në
 * bazë, prandaj është çelës i sigurt.
 */
interface SpecialtyNamesContextValue {
  /** Kërkon ngarkimin e hartës — thirret nga `useSpecialtyLabel`. */
  ensureLoaded: () => void
  byName: Map<string, Specialty>
}

const SpecialtyNamesContext = createContext<SpecialtyNamesContextValue | null>(null)

const key = (name: string) => name.trim().toLowerCase()

export function SpecialtyNamesProvider({ children }: { children: ReactNode }) {
  const [byName, setByName] = useState<Map<string, Specialty>>(() => new Map())
  // Ngarkohet vetëm kur ndonjë komponent shfaq vërtet emra specializimesh —
  // faqet si login-i s'kanë pse ta prekin këtë endpoint.
  const requested = useRef(false)

  const ensureLoaded = useCallback(() => {
    if (requested.current) return
    requested.current = true
    api
      .getSpecialties()
      .then((list) => setByName(new Map((list ?? []).map((s) => [key(s.name), s]))))
      // Dështimi këtu nuk është fatal: pa hartë, çdo emër shfaqet shqip.
      .catch(() => undefined)
  }, [])

  const value = useMemo(() => ({ ensureLoaded, byName }), [ensureLoaded, byName])
  return <SpecialtyNamesContext.Provider value={value}>{children}</SpecialtyNamesContext.Provider>
}

/**
 * Kthen një funksion që përkthen emrin e një specializimi në gjuhën aktive,
 * duke rënë te emri shqip kur përkthimi mungon (ose kur harta s'është ngarkuar
 * ende, ose kur komponenti përdoret jashtë provider-it — p.sh. në teste).
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useSpecialtyLabel(): (name: string) => string {
  const ctx = useContext(SpecialtyNamesContext)
  const { i18n } = useTranslation()
  const language = i18n.language

  const ensureLoaded = ctx?.ensureLoaded
  useEffect(() => {
    ensureLoaded?.()
  }, [ensureLoaded])

  const byName = ctx?.byName
  return useCallback(
    (name: string) => {
      if (!name) return name
      const match = byName?.get(key(name))
      if (!match) return name
      const translated = language.startsWith('en')
        ? match.nameEn
        : language.startsWith('sr')
          ? match.nameSr
          : null
      return translated?.trim() ? translated : name
    },
    [byName, language],
  )
}
