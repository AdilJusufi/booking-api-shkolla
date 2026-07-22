import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import type { Clinic, Doctor, Specialty } from '../lib/types'
import ClinicCard from '../components/ClinicCard'
import DoctorCard from '../components/DoctorCard'
import { EmptyState, ErrorBox, Spinner, specialtyLabel } from '../components/ui'

const KOSOVO_CITIES = [
  'Prishtinë', 'Prizren', 'Pejë', 'Gjakovë', 'Gjilan',
  'Mitrovicë', 'Ferizaj', 'Vushtrri', 'Podujevë', 'Suharekë',
]

type Tab = 'klinikat' | 'mjeket'

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [specialties, setSpecialties] = useState<Specialty[]>([])

  const city = searchParams.get('qyteti') ?? ''
  const specialtyId = searchParams.get('specialiteti') ?? ''
  const term = searchParams.get('q') ?? ''
  const tab = (searchParams.get('tab') as Tab) ?? 'klinikat'

  const [clinics, setClinics] = useState<Clinic[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getSpecialties().then(setSpecialties).catch(() => setSpecialties([]))
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    const load =
      tab === 'klinikat'
        ? api.searchClinics({ city, specialtyId, searchTerm: term }).then((r) => {
            if (active) setClinics(r.items)
          })
        : api.searchDoctors({ specialtyId, searchTerm: term }).then((r) => {
            if (active) setDoctors(r.items)
          })

    load
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [city, specialtyId, term, tab])

  function update(key: string, value: string) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next)
  }

  const specName = useMemo(
    () => specialties.find((s) => s.id === specialtyId)?.name,
    [specialties, specialtyId],
  )

  const heading =
    specName ? `${specialtyLabel(specName)}${city ? ` në ${city}` : ''}` : city ? `Mjekë & klinika në ${city}` : 'Të gjitha klinikat & mjekët'

  return (
    <div className="container page">
      <div className="page__head">
        <h1>{heading}</h1>
        <p>Filtro dhe zgjidh se ku dëshiron të rezervosh.</p>
      </div>

      <div className="filters">
        <div className="filters__field">
          <label>Qyteti</label>
          <select value={city} onChange={(e) => update('qyteti', e.target.value)}>
            <option value="">Të gjitha</option>
            {KOSOVO_CITIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="filters__field">
          <label>Specialiteti</label>
          <select value={specialtyId} onChange={(e) => update('specialiteti', e.target.value)}>
            <option value="">Të gjitha</option>
            {specialties.map((s) => (
              <option key={s.id} value={s.id}>{specialtyLabel(s.name)}</option>
            ))}
          </select>
        </div>
        <div className="filters__field filters__field--grow">
          <label>Kërko</label>
          <input
            type="search"
            placeholder="Emri i klinikës ose mjekut…"
            defaultValue={term}
            onKeyDown={(e) => {
              if (e.key === 'Enter') update('q', (e.target as HTMLInputElement).value)
            }}
          />
        </div>
      </div>

      <div className="tabs">
        <button
          className={`tab ${tab === 'klinikat' ? 'is-active' : ''}`}
          onClick={() => update('tab', 'klinikat')}
        >
          Klinikat
        </button>
        <button
          className={`tab ${tab === 'mjeket' ? 'is-active' : ''}`}
          onClick={() => update('tab', 'mjeket')}
        >
          Mjekët
        </button>
      </div>

      {loading ? (
        <Spinner label="Duke kërkuar…" />
      ) : error ? (
        <ErrorBox message={error} />
      ) : tab === 'klinikat' ? (
        clinics.length ? (
          <div className="grid grid--cards">
            {clinics.map((c) => (
              <ClinicCard key={c.id} clinic={c} />
            ))}
          </div>
        ) : (
          <EmptyState title="Nuk u gjet asnjë klinikë" hint="Provo të ndryshosh filtrat e kërkimit." />
        )
      ) : doctors.length ? (
        <div className="grid grid--cards">
          {doctors.map((d) => (
            <DoctorCard key={d.id} doctor={d} />
          ))}
        </div>
      ) : (
        <EmptyState icon="🩺" title="Nuk u gjet asnjë mjek" hint="Provo të ndryshosh filtrat e kërkimit." />
      )}
    </div>
  )
}
