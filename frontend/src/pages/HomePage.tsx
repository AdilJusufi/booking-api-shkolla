import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  CalendarDays,
  Clock,
  Check,
  ChevronRight,
  HandHeart,
  Lock,
  MapPin,
  Search,
  Stethoscope,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import type { Clinic, Doctor, Specialty } from '../lib/types'
import { CustomSelect, specialtyIcon } from '../components/ui'
import DoctorAvatar from '../components/DoctorAvatar'
import { useSpecialtyLabel } from '../context/SpecialtyNamesContext'
import type { CustomSelectOption } from '../components/ui'
import { KOSOVO_CITIES } from '../lib/kosovoCities'
import {
  useReveal,
  useSpotlight,
  useScrollProgress,
} from '../lib/motion'

const STEP_ICONS = [Search, CalendarDays, BadgeCheck]

/** Splits a headline into per-word spans so the hero can cascade them in. */
function SplitWords({ text, from = 0 }: { text: string; from?: number }) {
  return (
    <>
      {text.split(' ').map((word, i) => (
        <span className="lp-word" key={`${word}-${i}`} style={{ ['--w' as string]: from + i }}>
          {word}
        </span>
      ))}
    </>
  )
}

/**
 * The hero's side card. It used to be an animated "booking" with a named
 * doctor and invented free slots — fabricated content (WR-04). Now it shows
 * only real platform numbers from the API, a skeleton while they load, and
 * nothing at all if they can't be loaded.
 */
function HeroStats({ doctors, clinics, specialties }: { doctors: number | null; clinics: number | null; specialties: number | null }) {
  const { t } = useTranslation('patient')
  const loading = doctors === null || clinics === null || specialties === null
  const rows = [
    { label: t('home.stats.doctorsLabel'), value: doctors },
    { label: t('home.stats.clinicsLabel'), value: clinics },
    { label: t('home.stats.specialtiesLabel'), value: specialties },
  ]
  return (
    <aside className="lp-panel lp-stats" data-reveal aria-busy={loading || undefined}>
      <header className="lp-panel__head">
        <span className="lp-panel__who">
          <strong>{t('home.stats.title')}</strong>
          <span>{t('home.stats.hint')}</span>
        </span>
      </header>
      <dl className="lp-stats__grid">
        {rows.map((r) => (
          <div key={r.label} className="lp-stats__item">
            <dt>{r.label}</dt>
            <dd className="lp-num">{r.value === null ? <span className="lp-stats__skeleton skeleton-shimmer" /> : r.value}</dd>
          </div>
        ))}
      </dl>
      <Link to="/kerko" className="lp-btn lp-btn--accent lp-btn--block">
        {t('home.stats.cta')}
      </Link>
    </aside>
  )
}

/** Calm, retryable notice for a section whose data couldn't be loaded. */
function SectionError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation('patient')
  return (
    <div className="lp-load-error" role="status">
      <p>{t('home.loadError')}</p>
      <button type="button" className="lp-btn lp-btn--ghost" onClick={onRetry}>
        {t('home.retry')}
      </button>
    </div>
  )
}

export default function HomePage() {
  const { t } = useTranslation('patient')
  const specialtyLabel = useSpecialtyLabel()
  const { t: tCommon } = useTranslation('common')
  const navigate = useNavigate()
  // null = still loading. Never filled with placeholder people or clinics.
  const [specialties, setSpecialties] = useState<Specialty[] | null>(null)
  const [doctors, setDoctors] = useState<Doctor[] | null>(null)
  const [clinics, setClinics] = useState<Clinic[] | null>(null)
  const [doctorTotal, setDoctorTotal] = useState<number | null>(null)
  const [clinicTotal, setClinicTotal] = useState<number | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [city, setCity] = useState('')
  const [specialtyId, setSpecialtyId] = useState('')
  const [specialtiesLoading, setSpecialtiesLoading] = useState(true)
  const [openField, setOpenField] = useState<'city' | 'specialty' | null>(null)

  const pageRef = useReveal<HTMLDivElement>()
  const specGridRef = useSpotlight<HTMLDivElement>()
  const doctorRailRef = useSpotlight<HTMLDivElement>()
  const progress = useScrollProgress()

  const load = useCallback(() => {
    setLoadError(false)
    setSpecialtiesLoading(true)
    const fail = () => setLoadError(true)
    api.getSpecialties().then((s) => setSpecialties(s ?? [])).catch(fail).finally(() => setSpecialtiesLoading(false))
    api
      .searchDoctors({ page: 1 })
      .then((r) => {
        setDoctors(r.items ?? [])
        setDoctorTotal(r.totalItems ?? r.items?.length ?? 0)
      })
      .catch(fail)
    api
      .searchClinics({ page: 1 })
      .then((r) => {
        setClinics(r.items ?? [])
        setClinicTotal(r.totalItems ?? r.items?.length ?? 0)
      })
      .catch(fail)
  }, [])

  useEffect(load, [load])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (city) params.set('city', city)
    if (specialtyId) params.set('specialty', specialtyId)
    navigate(`/kerko?${params.toString()}`)
  }


  const CITY_OPTIONS: CustomSelectOption[] = [
    { value: '', label: t('home.allCities') },
    ...KOSOVO_CITIES.map(({ key, value }) => ({ value, label: tCommon(`cities.${key}`) })),
  ]

  const specialtyOptions = useMemo<CustomSelectOption[]>(
    () => [
      { value: '', label: t('home.allSpecialties') },
      ...(specialties ?? []).map((s) => ({ value: s.id, label: specialtyLabel(s.name) })),
    ],
    // `specialtyLabel` ndryshon identitet kur ngarkohet harta e përkthimeve ose
    // kur ndërrohet gjuha — pa të te varësitë, lista do të mbetej me etiketat e
    // vjetra derisa të ndryshonin `specialties` apo `t`.
    [specialties, t, specialtyLabel],
  )

  const shownDoctors = doctors?.slice(0, 6) ?? []
  const shownClinics = clinics?.slice(0, 3) ?? []
  const shownSpecs = specialties?.slice(0, 8) ?? []

  const STEPS = [
    { icon: STEP_ICONS[0], title: t('home.howItWorks.step1Title'), text: t('home.howItWorks.step1Text') },
    { icon: STEP_ICONS[1], title: t('home.howItWorks.step2Title'), text: t('home.howItWorks.step2Text') },
    { icon: STEP_ICONS[2], title: t('home.howItWorks.step3Title'), text: t('home.howItWorks.step3Text') },
  ]

  const FEATURES = [
    { icon: BadgeCheck, big: t('home.features.verifiedBig'), label: t('home.features.verifiedLabel') },
    { icon: Clock, big: t('home.features.hoursBig'), label: t('home.features.hoursLabel') },
    { icon: HandHeart, big: t('home.features.easyBig'), label: t('home.features.easyLabel') },
    { icon: MapPin, big: t('home.features.coverageBig'), label: t('home.features.coverageLabel') },
  ]

  return (
    <div className="lp" ref={pageRef}>
      <div className="lp-progress" style={{ transform: `scaleX(${progress})` }} aria-hidden />

      {/* ============ 1 — Hero ============ */}
      <section className="lp-hero">
        <div className="lp-hero__rules" aria-hidden />

        <div className="container lp-hero__inner">
          <div className="lp-hero__content">
            <span className="lp-eyebrow" data-reveal>
              <i className="lp-dot" aria-hidden /> {t('home.eyebrow')}
            </span>

            <h1 className="lp-hero__title">
              <SplitWords text={t('home.heroLine1')} />
              <SplitWords text={t('home.heroLine2')} from={3} />
              <span className="lp-word lp-word--accent" style={{ ['--w' as string]: 5 }}>
                {t('home.heroAccent')}
              </span>
              <SplitWords text={t('home.heroLine3')} from={7} />
            </h1>

            <p className="lp-hero__lead" data-reveal>
              {t('home.heroLead')}
            </p>

            <form className="lp-search" onSubmit={handleSearch} data-reveal>
              <div className="lp-search__field">
                <CustomSelect
                  label={t('home.cityLabel')}
                  options={CITY_OPTIONS}
                  value={city}
                  onChange={setCity}
                  open={openField === 'city'}
                  onOpenChange={(isOpen) => setOpenField(isOpen ? 'city' : null)}
                  panelVariant="hero"
                />
              </div>
              <span className="lp-search__divider" aria-hidden />
              <div className="lp-search__field">
                <CustomSelect
                  label={t('home.specialtyLabel')}
                  options={specialtyOptions}
                  value={specialtyId}
                  onChange={setSpecialtyId}
                  open={openField === 'specialty'}
                  onOpenChange={(isOpen) => setOpenField(isOpen ? 'specialty' : null)}
                  loading={specialtiesLoading}
                  panelVariant="hero"
                />
              </div>
              <button type="submit" className="lp-btn lp-btn--accent lp-search__submit">
                <Search size={16} strokeWidth={2.25} /> {t('home.searchCta')}
              </button>
            </form>

            <ul className="lp-hero__trust" data-reveal>
              <li><Check size={15} strokeWidth={2.5} /> {t('home.trustFree')}</li>
              <li><Check size={15} strokeWidth={2.5} /> {t('home.trustVerified')}</li>
              <li><Lock size={15} strokeWidth={2.5} /> {t('home.trustEncrypted')}</li>
            </ul>
          </div>

          {!loadError && (
            <HeroStats doctors={doctorTotal} clinics={clinicTotal} specialties={specialties?.length ?? null} />
          )}
        </div>
      </section>

      {/* ============ 2 — Specialties (gapless bento) ============ */}
      <section className="lp-section container">
        <div className="lp-head lp-head--row">
          <div data-reveal>
            <span className="lp-kicker">{t('home.specialtiesSection.kicker')}</span>
            <h2>{t('home.specialtiesSection.title')}</h2>
            <p>{t('home.specialtiesSection.subtitle')}</p>
          </div>
          <Link to="/kerko" className="lp-link" data-reveal>
            {t('home.specialtiesSection.seeAll')} <ChevronRight size={16} strokeWidth={2.25} />
          </Link>
        </div>

        {specialties === null && loadError ? (
          <SectionError onRetry={load} />
        ) : (
          <div className="lp-bento" ref={specGridRef}>
            {specialties === null
              ? Array.from({ length: 8 }).map((_, i) => (
                  <span key={i} className="lp-bento__cell lp-skeleton-cell skeleton-shimmer" aria-hidden />
                ))
              : shownSpecs.map((s) => {
                  const Icon = specialtyIcon(s.name)
                  return (
                    <button
                      key={s.id}
                      className="lp-bento__cell"
                      data-reveal
                      data-spotlight
                      onClick={() => navigate(`/kerko?specialty=${s.id}`)}
                    >
                      <span className="lp-bento__icon"><Icon size={22} strokeWidth={1.6} /></span>
                      <span className="lp-bento__name">{specialtyLabel(s.name)}</span>
                      <ArrowUpRight className="lp-bento__arrow" size={16} strokeWidth={2.25} />
                    </button>
                  )
                })}
          </div>
        )}
      </section>

      {/* ============ 3 — How it works (asymmetric, sticky left) ============ */}
      <section className="lp-section lp-section--soft">
        <div className="container lp-how">
          <div className="lp-how__aside">
            <div className="lp-how__sticky">
              <span className="lp-kicker" data-reveal>{t('home.howItWorks.kicker')}</span>
              <h2 data-reveal>{t('home.howItWorks.title')}</h2>
              <p data-reveal>{t('home.howItWorks.subtitle')}</p>
              <Link to="/kerko" className="lp-btn lp-btn--accent lp-how__cta" data-reveal>
                {t('home.howItWorks.cta')} <ArrowRight size={16} strokeWidth={2.25} />
              </Link>
            </div>
          </div>

          <ol className="lp-how__list">
            {STEPS.map((step, i) => (
              <li className="lp-how__step" key={step.title} data-reveal>
                <span className="lp-how__num">{String(i + 1).padStart(2, '0')}</span>
                <span className="lp-how__icon" aria-hidden>
                  <step.icon size={20} strokeWidth={1.6} />
                </span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ============ 4 — Doctors (horizontal snap rail) ============ */}
      <section className="lp-section">
        <div className="container lp-head lp-head--row">
          <div data-reveal>
            <span className="lp-kicker">{t('home.doctorsSection.kicker')}</span>
            <h2>{t('home.doctorsSection.title')}</h2>
            <p>{t('home.doctorsSection.subtitle')}</p>
          </div>
          <Link to="/kerko?tab=mjeket" className="lp-link" data-reveal>
            {t('home.doctorsSection.seeAll')} <ChevronRight size={16} strokeWidth={2.25} />
          </Link>
        </div>

        {doctors === null && loadError ? (
          <div className="container"><SectionError onRetry={load} /></div>
        ) : (
          <div className="lp-rail" ref={doctorRailRef}>
            <div className="lp-rail__track">
              {doctors === null
                ? Array.from({ length: 4 }).map((_, i) => (
                    <span key={i} className="lp-doc lp-skeleton-card skeleton-shimmer" aria-hidden />
                  ))
                : shownDoctors.map((d) => (
                    <article className="lp-doc" key={d.id} data-reveal data-spotlight>
                      <DoctorAvatar
                        as="span"
                        className="lp-doc__avatar"
                        firstName={d.firstName}
                        lastName={d.lastName}
                        photoUrl={d.photoUrl}
                        displayPx={64}
                      />
                      <h3 className="lp-doc__name">
                        Dr. {d.firstName} {d.lastName}
                      </h3>
                      <div className="lp-tags">
                        {d.specialties.slice(0, 1).map((s) => (
                          <span key={s} className="lp-tag">{specialtyLabel(s)}</span>
                        ))}
                      </div>
                      <p className="lp-doc__exp">
                        {d.yearsOfExperience > 0
                          ? t('home.doctorsSection.experienceYears', { count: d.yearsOfExperience })
                          : t('home.doctorsSection.licensedDoctor')}
                      </p>
                      {/* WR-26: straight to this doctor's slots, not a generic search. */}
                      <Link to={`/mjeku/${d.id}`} className="lp-btn lp-btn--ghost lp-btn--block">
                        {t('home.doctorsSection.browseSlots')}
                      </Link>
                    </article>
                  ))}
            </div>
          </div>
        )}
      </section>

      {/* ============ 5 — Feature band ============ */}
      <section className="lp-band">
        <div className="container lp-band__grid">
          {FEATURES.map((f) => (
            <div className="lp-band__item" key={f.label} data-reveal>
              <span className="lp-band__icon" aria-hidden>
                <f.icon size={20} strokeWidth={1.6} />
              </span>
              <span className="lp-band__big">{f.big}</span>
              <span className="lp-band__label">{f.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ============ 6 — Clinics (asymmetric grid) ============ */}
      <section className="lp-section container">
        <div className="lp-head lp-head--row">
          <div data-reveal>
            <span className="lp-kicker">{t('home.clinicsSection.kicker')}</span>
            <h2>{t('home.clinicsSection.title')}</h2>
            <p>{t('home.clinicsSection.subtitle')}</p>
          </div>
          <Link to="/kerko?tab=klinika" className="lp-link" data-reveal>
            {t('home.clinicsSection.seeAll')} <ChevronRight size={16} strokeWidth={2.25} />
          </Link>
        </div>

        {clinics === null && loadError ? (
          <SectionError onRetry={load} />
        ) : (
          <div className="lp-clinics">
            {clinics === null
              ? Array.from({ length: 3 }).map((_, i) => (
                  <span key={i} className={`lp-clinic lp-skeleton-card skeleton-shimmer ${i === 0 ? 'lp-clinic--feature' : ''}`} aria-hidden />
                ))
              : shownClinics.map((c, i) => (
                  <Link
                    to={`/klinika/${c.id}`}
                    className={`lp-clinic ${i === 0 ? 'lp-clinic--feature' : ''}`}
                    key={c.id}
                    data-reveal
                  >
                    <span className="lp-clinic__art" aria-hidden>
                      <Stethoscope size={i === 0 ? 34 : 24} strokeWidth={1.25} />
                    </span>
                    <span className="lp-clinic__body">
                      <h3>{c.name}</h3>
                      {c.cities.length > 0 && (
                        <span className="lp-clinic__where">
                          <MapPin size={13} strokeWidth={2} /> {c.cities.join(', ')}
                        </span>
                      )}
                      <span className="lp-clinic__cta">
                        {t('home.clinicsSection.viewClinic')} <ArrowUpRight size={16} strokeWidth={2.25} />
                      </span>
                    </span>
                  </Link>
                ))}
          </div>
        )}
      </section>

      {/* ============ 7 — Final CTA ============ */}
      <section className="lp-section container">
        <div className="lp-cta" data-reveal>
          <div className="lp-cta__rules" aria-hidden />
          <div className="lp-cta__content">
            <span className="lp-kicker lp-kicker--invert">{t('home.finalCta.kicker')}</span>
            <h2>{t('home.finalCta.title')}</h2>
            <p>{t('home.finalCta.subtitle')}</p>
            <Link to="/kerko" className="lp-btn lp-btn--accent lp-btn--lg">
              {t('home.finalCta.cta')} <ArrowRight size={17} strokeWidth={2.25} />
            </Link>
            <span className="lp-cta__fine">
              {t('home.finalCta.fineprint')}
            </span>
          </div>
        </div>
      </section>
    </div>
  )
}
