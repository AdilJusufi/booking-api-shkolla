import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertCircle,
  ArrowUpDown,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  SlidersHorizontal,
  Star,
  Stethoscope,
} from 'lucide-react'
import { api } from '../lib/api'
import type { Clinic, Doctor, Specialty } from '../lib/types'
import ClinicCard from '../components/ClinicCard'
import DoctorCard from '../components/DoctorCard'
import { Dropdown, EmptyState, specialtyLabel } from '../components/ui'

const KOSOVO_CITIES = [
  'Prishtinë', 'Prizren', 'Pejë', 'Gjakovë', 'Gjilan', 'Ferizaj', 'Mitrovicë', 'Vushtrri',
]

type Tab = 'klinika' | 'mjeket'
type SortOption = 'relevance' | 'name' | 'rating'

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'relevance', label: 'Rendito sipas: Relevanca' },
  { value: 'name', label: 'Emri (A-Z)' },
  { value: 'rating', label: 'Më të vlerësuarat' },
]

const PAGE_SIZE = 12

function StarRating({ count }: { count: number }) {
  return (
    <span className="filter-card__stars">
      {Array.from({ length: count }).map((_, i) => (
        <Star key={i} size={14} strokeWidth={1.5} fill="currentColor" />
      ))}
    </span>
  )
}

function SkeletonCards({ count }: { count: number }) {
  return (
    <div className="grid grid--cards">
      {Array.from({ length: count }).map((_, i) => (
        <div className="skeleton-card" key={i}>
          <div className="skeleton-card__banner skeleton-shimmer" />
          <div className="skeleton-card__body">
            <div className="skeleton-shimmer" style={{ height: 16, width: '70%' }} />
            <div className="skeleton-shimmer" style={{ height: 12, width: '45%' }} />
            <div className="skeleton-shimmer" style={{ height: 12, width: '90%' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const tab = (searchParams.get('tab') as Tab) === 'mjeket' ? 'mjeket' : 'klinika'
  const urlQ = searchParams.get('q') ?? ''
  const urlSpecialty = searchParams.get('specialty') ?? ''
  const urlCity = searchParams.get('city') ?? ''
  const page = Math.max(1, Number(searchParams.get('page')) || 1)

  const [searchInput, setSearchInput] = useState(urlQ)
  const [specialties, setSpecialties] = useState<Specialty[]>([])
  const [selectedCities, setSelectedCities] = useState<string[]>(urlCity ? [urlCity] : [])
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>(urlSpecialty ? [urlSpecialty] : [])
  const [showMoreSpecs, setShowMoreSpecs] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [sort, setSort] = useState<SortOption>('relevance')

  const [clinics, setClinics] = useState<Clinic[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [totalItems, setTotalItems] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const resultsRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    api.getSpecialties().then(setSpecialties).catch(() => setSpecialties([]))
  }, [])

  function updateParams(next: Record<string, string | number | undefined>) {
    const params = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === '') params.delete(key)
      else params.set(key, String(value))
    }
    setSearchParams(params)
  }

  // Debounced text search → URL
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      updateParams({ q: searchInput || undefined, page: 1 })
    }, 400)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')

    const load =
      tab === 'klinika'
        ? api
            .searchClinics({ city: urlCity, specialtyId: urlSpecialty, searchTerm: urlQ, page, pageSize: PAGE_SIZE })
            .then((r) => {
              if (!active) return
              setClinics(r.items)
              setTotalItems(r.totalItems)
              setTotalPages(r.totalPages)
            })
        : api
            .searchDoctors({ specialtyId: urlSpecialty, searchTerm: urlQ, page })
            .then((r) => {
              if (!active) return
              setDoctors(r.items)
              setTotalItems(r.totalItems)
              setTotalPages(r.totalPages)
            })

    load
      .catch((e) => active && setError(e.message ?? 'Ndodhi një gabim.'))
      .finally(() => active && setLoading(false))

    return () => {
      active = false
    }
  }, [tab, urlCity, urlSpecialty, urlQ, page])

  function switchTab(next: Tab) {
    updateParams({ tab: next, page: 1 })
  }

  function toggleCity(city: string) {
    setSelectedCities((prev) => (prev.includes(city) ? prev.filter((c) => c !== city) : [...prev, city]))
  }

  function toggleSpecialty(id: string) {
    setSelectedSpecialties((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
  }

  function applyFilters() {
    updateParams({
      city: selectedCities[0] || undefined,
      specialty: selectedSpecialties[0] || undefined,
      page: 1,
    })
    setFilterOpen(false)
  }

  function clearAllFilters() {
    setSelectedCities([])
    setSelectedSpecialties([])
    setSearchInput('')
    updateParams({ city: undefined, specialty: undefined, q: undefined, page: 1 })
  }

  function selectQuickSpecialty(id: string) {
    setSelectedSpecialties(id ? [id] : [])
    updateParams({ specialty: id || undefined, page: 1 })
  }

  function goToPage(next: number) {
    updateParams({ page: next })
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const activeFilterCount = (selectedCities.length ? 1 : 0) + (selectedSpecialties.length ? 1 : 0)

  const visibleSpecialties = showMoreSpecs ? specialties : specialties.slice(0, 6)

  const sortedClinics = useMemo(() => {
    const arr = [...clinics]
    if (sort === 'name') arr.sort((a, b) => a.name.localeCompare(b.name))
    return arr
  }, [clinics, sort])

  const sortedDoctors = useMemo(() => {
    const arr = [...doctors]
    if (sort === 'name') arr.sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`))
    return arr
  }, [doctors, sort])

  const cityHeading = urlCity || 'Kosovë'
  const resultsHeading = tab === 'klinika' ? `Klinika në ${cityHeading}` : `Mjekë në ${cityHeading}`

  const pageNumbers = useMemo(() => {
    const pages: number[] = []
    const start = Math.max(1, page - 2)
    const end = Math.min(totalPages, start + 4)
    for (let p = start; p <= end; p++) pages.push(p)
    return pages
  }, [page, totalPages])

  return (
    <>
      <section className="search-hero">
        <div className="container">
          <h1>Gjeni mjekun ose klinikën e duhur</h1>
          <p className="search-hero__sub">Kërkoni nga 500+ mjekë dhe 80+ klinika në Kosovë</p>

          <div className="searchbar">
            <div className="searchbar__input">
              <span className="searchbar__icon" aria-hidden><Search size={20} strokeWidth={1.5} /></span>
              <input
                type="search"
                placeholder="Kërkoni mjek, klinikë, ose specialitet..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <button
              className="btn btn--primary searchbar__submit"
              onClick={() => updateParams({ q: searchInput || undefined, page: 1 })}
            >
              Kërko
            </button>
          </div>

          <div className="spec-chips">
            <button
              className={`spec-chip ${selectedSpecialties.length === 0 ? 'is-active' : ''}`}
              onClick={() => selectQuickSpecialty('')}
            >
              Të gjitha
            </button>
            {specialties.map((s) => (
              <button
                key={s.id}
                className={`spec-chip ${selectedSpecialties.includes(s.id) ? 'is-active' : ''}`}
                onClick={() => selectQuickSpecialty(s.id)}
              >
                {specialtyLabel(s.name)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="search-shell">
        <div className="search-tabs">
          <button className={`search-tab ${tab === 'klinika' ? 'is-active' : ''}`} onClick={() => switchTab('klinika')}>
            <Building2 size={16} strokeWidth={1.5} /> Klinika
          </button>
          <button className={`search-tab ${tab === 'mjeket' ? 'is-active' : ''}`} onClick={() => switchTab('mjeket')}>
            <Stethoscope size={16} strokeWidth={1.5} /> Mjekët
          </button>
        </div>

        <div className="search-layout">
          <div>
            <button
              type="button"
              className={`filter-toggle ${filterOpen ? 'is-open' : ''}`}
              onClick={() => setFilterOpen((v) => !v)}
            >
              <span>
                <SlidersHorizontal size={16} strokeWidth={1.5} /> Filtrat
                {activeFilterCount > 0 && <span className="filter-toggle__badge">{activeFilterCount}</span>}
              </span>
              <ChevronDown size={16} strokeWidth={1.5} className="filter-toggle__chevron" />
            </button>

            <div className={`filter-card ${filterOpen ? 'is-open' : ''}`}>
              <div className="filter-card__section-label">Qyteti</div>
              <div className="filter-card__list">
                {KOSOVO_CITIES.map((city) => (
                  <label key={city}>
                    <input
                      type="checkbox"
                      checked={selectedCities.includes(city)}
                      onChange={() => toggleCity(city)}
                    />
                    {city}
                  </label>
                ))}
              </div>

              <div className="filter-card__divider" />

              <div className="filter-card__section-label">Specialiteti</div>
              <div className="filter-card__list">
                {visibleSpecialties.map((s) => (
                  <label key={s.id}>
                    <input
                      type="checkbox"
                      checked={selectedSpecialties.includes(s.id)}
                      onChange={() => toggleSpecialty(s.id)}
                    />
                    {specialtyLabel(s.name)}
                  </label>
                ))}
              </div>
              {specialties.length > 6 && (
                <button className="filter-card__more" onClick={() => setShowMoreSpecs((v) => !v)}>
                  {showMoreSpecs ? 'Shfaq më pak ▴' : 'Shfaq më shumë ▾'}
                </button>
              )}

              {tab === 'mjeket' && (
                <>
                  <div className="filter-card__divider" />
                  <div className="filter-card__section-label">Vlerësimi minimal</div>
                  <div className="filter-card__list">
                    <label>
                      <input type="radio" name="rating" /> <StarRating count={5} /> & lart
                    </label>
                    <label>
                      <input type="radio" name="rating" /> <StarRating count={4} /> & lart
                    </label>
                    <label>
                      <input type="radio" name="rating" /> <StarRating count={3} /> & lart
                    </label>
                    <label>
                      <input type="radio" name="rating" defaultChecked /> Çdo vlerësim
                    </label>
                  </div>
                </>
              )}

              <button className="btn btn--primary btn--block" style={{ marginTop: 16 }} onClick={applyFilters}>
                Apliko filtrat
              </button>
              <button className="filter-card__clear" onClick={clearAllFilters}>
                Pastro të gjitha
              </button>
            </div>
          </div>

          <div ref={resultsRef}>
            <div className="results-head">
              <div>
                <h2>{resultsHeading}</h2>
                <div className="results-head__count">{totalItems} rezultate të gjetur</div>
              </div>
              <Dropdown
                options={SORT_OPTIONS}
                value={sort}
                onChange={(v) => setSort(v as SortOption)}
                icon={ArrowUpDown}
              />
            </div>

            {error ? (
              <EmptyState icon={AlertCircle} title="Ndodhi një gabim" hint={error} />
            ) : loading ? (
              <SkeletonCards count={6} />
            ) : tab === 'klinika' ? (
              sortedClinics.length ? (
                <div className="grid grid--cards">
                  {sortedClinics.map((c) => (
                    <ClinicCard key={c.id} clinic={c} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="Nuk u gjetën rezultate"
                  hint="Provoni të ndryshoni filtrat ose termin e kërkimit."
                />
              )
            ) : sortedDoctors.length ? (
              <div className="grid grid--cards">
                {sortedDoctors.map((d) => (
                  <DoctorCard key={d.id} doctor={d} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Stethoscope}
                title="Nuk u gjetën rezultate"
                hint="Provoni të ndryshoni filtrat ose termin e kërkimit."
              />
            )}

            {!loading && !error && totalPages > 1 && (
              <div className="pagination">
                <button className="pagination__arrow" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                  <ChevronLeft size={16} strokeWidth={1.5} /> Prapa
                </button>
                {pageNumbers.map((p) => (
                  <button key={p} className={p === page ? 'is-active' : ''} onClick={() => goToPage(p)}>
                    {p}
                  </button>
                ))}
                <button className="pagination__arrow" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>
                  Para <ChevronRight size={16} strokeWidth={1.5} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
