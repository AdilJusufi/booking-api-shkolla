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
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import type { Clinic, Doctor, Specialty } from '../lib/types'
import ClinicCard from '../components/ClinicCard'
import DoctorCard from '../components/DoctorCard'
import { Dropdown, EmptyState, specialtyLabel } from '../components/ui'
import { useReveal } from '../lib/motion'
import { KOSOVO_CITIES } from '../lib/kosovoCities'

type Tab = 'klinika' | 'mjeket'
type SortOption = 'relevance' | 'name' | 'rating'

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
  const { t } = useTranslation('patient')
  const { t: tCommon } = useTranslation('common')
  const SORT_OPTIONS: { value: SortOption; label: string }[] = [
    { value: 'relevance', label: t('search.sortRelevance') },
    { value: 'name', label: t('search.sortName') },
    { value: 'rating', label: t('search.sortRating') },
  ]
  const revealRef = useReveal()
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
  const [retryToken, setRetryToken] = useState(0)

  const resultsRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    api.getSpecialties().then(setSpecialties).catch(() => setSpecialties([]))
  }, [])

  // Uses the updater-function form of setSearchParams — the debounced search
  // effect below schedules a call up to 400ms out, and a plain `searchParams`
  // closure captured at that point would be stale by the time it fires,
  // clobbering any param change (e.g. a tab switch) made in the meantime.
  function updateParams(next: Record<string, string | number | undefined>) {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev)
      for (const [key, value] of Object.entries(next)) {
        if (value === undefined || value === '') params.delete(key)
        else params.set(key, String(value))
      }
      return params
    })
  }

  // Debounced text search → URL. Guarded on `searchInput === urlQ` so it does
  // nothing when there's no actual change to sync — without that guard this
  // still fires 400ms after every mount (searchInput starts equal to urlQ),
  // and calling updateParams with `page: 1` at that point can stomp on an
  // unrelated param change (e.g. a tab switch) made in the interim.
  useEffect(() => {
    if (searchInput === urlQ) return
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
      .catch((e) => active && setError(getErrorMessage(e)))
      .finally(() => active && setLoading(false))

    return () => {
      active = false
    }
  }, [tab, urlCity, urlSpecialty, urlQ, page, retryToken])

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

  // urlCity carries the stable Albanian value (see lib/kosovoCities.ts) — look
  // up its translated display label rather than showing the raw value in an
  // English/Serbian UI.
  const matchedCity = KOSOVO_CITIES.find((c) => c.value === urlCity)
  const cityHeading = matchedCity ? tCommon(`cities.${matchedCity.key}`) : urlCity || t('search.defaultCity')
  const resultsHeading = tab === 'klinika'
    ? t('search.headingClinicsIn', { city: cityHeading })
    : t('search.headingDoctorsIn', { city: cityHeading })

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
          <h1>{t('search.title')}</h1>
          <p className="search-hero__sub">{t('search.subtitle')}</p>

          <div className="searchbar">
            <div className="searchbar__input">
              <span className="searchbar__icon" aria-hidden><Search size={20} strokeWidth={1.5} /></span>
              <input
                type="search"
                placeholder={t('search.searchPlaceholder')}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <button
              className="btn btn--primary searchbar__submit"
              onClick={() => updateParams({ q: searchInput || undefined, page: 1 })}
            >
              {tCommon('buttons.search')}
            </button>
          </div>

          <div className="spec-chips">
            <button
              className={`spec-chip ${selectedSpecialties.length === 0 ? 'is-active' : ''}`}
              onClick={() => selectQuickSpecialty('')}
            >
              {t('search.allSpecialtiesChip')}
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
            <Building2 size={16} strokeWidth={1.5} /> {t('search.tabClinics')}
          </button>
          <button className={`search-tab ${tab === 'mjeket' ? 'is-active' : ''}`} onClick={() => switchTab('mjeket')}>
            <Stethoscope size={16} strokeWidth={1.5} /> {t('search.tabDoctors')}
          </button>
        </div>

        <div className="search-layout" ref={revealRef} data-reveal-root>
          <div>
            <button
              type="button"
              className={`filter-toggle ${filterOpen ? 'is-open' : ''}`}
              onClick={() => setFilterOpen((v) => !v)}
            >
              <span>
                <SlidersHorizontal size={16} strokeWidth={1.5} /> {t('search.filtersToggle')}
                {activeFilterCount > 0 && <span className="filter-toggle__badge">{activeFilterCount}</span>}
              </span>
              <ChevronDown size={16} strokeWidth={1.5} className="filter-toggle__chevron" />
            </button>

            <div className={`filter-card ${filterOpen ? 'is-open' : ''}`}>
              <div className="filter-card__section-label">{t('search.cityLabel')}</div>
              <div className="filter-card__list">
                {KOSOVO_CITIES.map(({ key, value }) => (
                  <label key={value}>
                    <input
                      type="checkbox"
                      checked={selectedCities.includes(value)}
                      onChange={() => toggleCity(value)}
                    />
                    {tCommon(`cities.${key}`)}
                  </label>
                ))}
              </div>

              <div className="filter-card__divider" />

              <div className="filter-card__section-label">{t('search.specialtyLabel')}</div>
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
                  {showMoreSpecs ? t('search.showLess') : t('search.showMore')}
                </button>
              )}

              {tab === 'mjeket' && (
                <>
                  <div className="filter-card__divider" />
                  <div className="filter-card__section-label">{t('search.minRatingLabel')}</div>
                  <div className="filter-card__list">
                    <label>
                      <input type="radio" name="rating" /> <StarRating count={5} /> {t('search.andUp')}
                    </label>
                    <label>
                      <input type="radio" name="rating" /> <StarRating count={4} /> {t('search.andUp')}
                    </label>
                    <label>
                      <input type="radio" name="rating" /> <StarRating count={3} /> {t('search.andUp')}
                    </label>
                    <label>
                      <input type="radio" name="rating" defaultChecked /> {t('search.anyRating')}
                    </label>
                  </div>
                </>
              )}

              <button className="btn btn--primary btn--block" style={{ marginTop: 16 }} onClick={applyFilters}>
                {t('search.applyFilters')}
              </button>
              <button className="filter-card__clear" onClick={clearAllFilters}>
                {t('search.clearAllFilters')}
              </button>
            </div>
          </div>

          <div ref={resultsRef}>
            <div className="results-head">
              <div>
                <h2>{resultsHeading}</h2>
                <div className="results-head__count">{t('search.resultCount', { count: totalItems })}</div>
              </div>
              <Dropdown
                options={SORT_OPTIONS}
                value={sort}
                onChange={(v) => setSort(v as SortOption)}
                icon={ArrowUpDown}
              />
            </div>

            {error ? (
              <EmptyState
                icon={AlertCircle}
                title={t('search.errorTitle')}
                hint={error}
                action={
                  <button type="button" className="btn btn--primary btn--sm" onClick={() => setRetryToken((n) => n + 1)}>
                    {tCommon('buttons.retry')}
                  </button>
                }
              />
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
                  title={t('search.noResultsTitle')}
                  hint={t('search.noResultsHint')}
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
                title={t('search.noResultsTitle')}
                hint={t('search.noResultsHint')}
              />
            )}

            {!loading && !error && totalPages > 1 && (
              <div className="pagination">
                <button className="pagination__arrow" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                  <ChevronLeft size={16} strokeWidth={1.5} /> {t('search.prevPage')}
                </button>
                {pageNumbers.map((p) => (
                  <button key={p} className={p === page ? 'is-active' : ''} onClick={() => goToPage(p)}>
                    {p}
                  </button>
                ))}
                <button className="pagination__arrow" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>
                  {t('search.nextPage')} <ChevronRight size={16} strokeWidth={1.5} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
