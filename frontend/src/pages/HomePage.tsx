import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  Baby,
  BadgeCheck,
  Bone,
  Brain,
  CalendarDays,
  Check,
  ChevronRight,
  Clock,
  Eye,
  HandHeart,
  Heart,
  Lock,
  MapPin,
  MessageCircleHeart,
  Quote,
  Scan,
  Search,
  ShieldCheck,
  Star,
  Stethoscope,
  Venus,
  type LucideProps,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import type { Clinic, Doctor, Specialty } from '../lib/types'
import { CustomSelect, initials, specialtyIcon, specialtyLabel } from '../components/ui'
import type { CustomSelectOption } from '../components/ui'
import { KOSOVO_CITIES } from '../lib/kosovoCities'
import { formatNumber, weekdayName } from '../lib/format'
import {
  useCountUp,
  useReveal,
  useRotatingIndex,
  useSpotlight,
  useScrollProgress,
} from '../lib/motion'

/* ---------- Hardcoded demo fallbacks (marketing page must never look empty) ----------
 * Content (names, quotes, specialty labels) lives in patient.json's home.demo tree,
 * keyed positionally — these arrays just carry the icon and structural shape that
 * JSON can't. */

const DEMO_SPEC_ICONS: ComponentType<LucideProps>[] = [Heart, Baby, Brain, Bone, Scan, Venus, Eye, MessageCircleHeart]
const DEMO_SPEC_KEYS = ['cardiology', 'pediatrics', 'neurology', 'orthopedics', 'dermatology', 'gynecology', 'ophthalmology', 'psychiatry'] as const

const DEMO_DOCTOR_EXPERIENCE = [12, 8, 15, 9, 17]
const DEMO_CLINIC_DOCTOR_COUNTS = [42, 18, 11]

const STEP_ICONS = [Search, CalendarDays, BadgeCheck]

const MARQUEE_PARTNERS = [
  'Spitali Amerikan', 'Poliklinika Rilindja', 'Klinika Vita', 'Dental Art',
  'Medica Group', 'Bio Care', 'Klinika Sanus', 'Pediatria Lira',
]

const PANEL_SLOTS = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30']
// Decorative demo dates for the booking panel — Monday(1) through Friday(5)
// in JS Date.getDay() terms, with the weekday label resolved via
// weekdayName() at render time so it follows the active language.
const PANEL_DAY_NUMBERS = ['12', '13', '14', '15', '16']

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.charAt(0) ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : ''
  return `${first}${last}`.toUpperCase()
}

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

function Stat({ to, suffix, label }: { to: number; suffix: string; label: string }) {
  const { ref, value } = useCountUp(to)
  return (
    <div className="lp-stat" data-reveal>
      <span className="lp-stat__value">
        <span ref={ref}>{formatNumber(value)}</span>
        {suffix}
      </span>
      <span className="lp-stat__label">{label}</span>
    </div>
  )
}

/** The hero's proof object: one surface, no stacking, showing a real booking flow. */
function BookingPanel() {
  const { t } = useTranslation('patient')
  const activeSlot = useRotatingIndex(PANEL_SLOTS.length, 2600)
  const activeDay = useRotatingIndex(PANEL_DAY_NUMBERS.length, 7800)

  return (
    <aside className="lp-panel" data-reveal aria-label={t('home.panel.ariaLabel')}>
      <header className="lp-panel__head">
        <span className="lp-panel__avatar">AG</span>
        <span className="lp-panel__who">
          <strong>{t('home.panel.doctorName')}</strong>
          <span>{t('home.panel.doctorSpecialty')}</span>
        </span>
        <span className="lp-panel__live">
          <i className="lp-dot" aria-hidden /> {t('home.panel.available')}
        </span>
      </header>

      <div className="lp-panel__days" role="presentation">
        {PANEL_DAY_NUMBERS.map((n, i) => (
          <span key={n} className={`lp-day ${i === activeDay ? 'is-on' : ''}`}>
            <em>{weekdayName(i + 1, 'short')}</em>
            <b>{n}</b>
          </span>
        ))}
      </div>

      <div className="lp-panel__slots">
        <div className="lp-panel__row">
          <span className="lp-panel__label">{t('home.panel.freeSlotsLabel')}</span>
          <span className="lp-panel__count">
            {t('home.panel.slotCount', { count: PANEL_SLOTS.length })}
          </span>
        </div>
        <div className="lp-slots">
          {PANEL_SLOTS.map((slot, i) => (
            <span key={slot} className={`lp-slot ${i === activeSlot ? 'is-on' : ''}`}>
              {slot}
            </span>
          ))}
        </div>
      </div>

      <Link to="/kerko" className="lp-btn lp-btn--accent lp-btn--block">
        {t('home.panel.confirmCta')}
      </Link>

      <footer className="lp-panel__foot">
        <span className="lp-stars" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <Star key={i} size={13} strokeWidth={0} fill="currentColor" />
          ))}
        </span>
        <strong>4.9</strong>
        <span className="lp-panel__reviews">{t('home.panel.reviewCount')}</span>
      </footer>
    </aside>
  )
}

function VerifiedBadge({ title }: { title: string }) {
  return (
    <span className="lp-verified" title={title}>
      <BadgeCheck size={15} strokeWidth={2} />
    </span>
  )
}

export default function HomePage() {
  const { t } = useTranslation('patient')
  const { t: tCommon } = useTranslation('common')
  const navigate = useNavigate()
  const [specialties, setSpecialties] = useState<Specialty[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [clinics, setClinics] = useState<Clinic[]>([])
  const [city, setCity] = useState('')
  const [specialtyId, setSpecialtyId] = useState('')
  const [specialtiesLoading, setSpecialtiesLoading] = useState(true)
  const [openField, setOpenField] = useState<'city' | 'specialty' | null>(null)

  const pageRef = useReveal<HTMLDivElement>()
  const specGridRef = useSpotlight<HTMLDivElement>()
  const doctorRailRef = useSpotlight<HTMLDivElement>()
  const progress = useScrollProgress()

  useEffect(() => {
    api.getSpecialties().then((s) => setSpecialties(s ?? [])).catch(() => setSpecialties([])).finally(() => setSpecialtiesLoading(false))
    api.searchDoctors({ page: 1 }).then((r) => setDoctors(r.items ?? [])).catch(() => setDoctors([]))
    api.searchClinics({ page: 1 }).then((r) => setClinics(r.items ?? [])).catch(() => setClinics([]))
  }, [])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (city) params.set('city', city)
    if (specialtyId) params.set('specialty', specialtyId)
    navigate(`/kerko?${params.toString()}`)
  }

  const hasDoctors = doctors.length > 0
  const hasClinics = clinics.length > 0
  const hasSpecs = specialties.length > 0

  const CITY_OPTIONS: CustomSelectOption[] = [
    { value: '', label: t('home.allCities') },
    ...KOSOVO_CITIES.map(({ key, value }) => ({ value, label: tCommon(`cities.${key}`) })),
  ]

  const specialtyOptions = useMemo<CustomSelectOption[]>(
    () => [
      { value: '', label: t('home.allSpecialties') },
      ...specialties.map((s) => ({ value: s.id, label: specialtyLabel(s.name) })),
    ],
    [specialties, t],
  )

  const shownDoctors = hasDoctors ? doctors.slice(0, 6) : []
  const shownClinics = hasClinics ? clinics.slice(0, 3) : []
  const shownSpecs = hasSpecs ? specialties.slice(0, 8) : []

  const STATS = [
    { to: 120, suffix: '+', label: t('home.stats.verifiedDoctors') },
    { to: 18, suffix: '', label: t('home.stats.partnerClinics') },
    { to: 4200, suffix: '+', label: t('home.stats.bookedAppointments') },
    { to: 7, suffix: '', label: t('home.stats.citiesInKosovo') },
  ]

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

  const DEMO_SPECS = DEMO_SPEC_KEYS.map((key, i) => ({
    key,
    icon: DEMO_SPEC_ICONS[i],
    label: t(`home.demo.specialties.${key}`),
  }))

  const demoDoctorNames = t('home.demo.doctors', { returnObjects: true }) as { name: string; specialty: string; next: string }[]
  const DEMO_DOCTORS = demoDoctorNames.map((d, i) => ({ ...d, experience: DEMO_DOCTOR_EXPERIENCE[i] }))

  const demoClinicsRaw = t('home.demo.clinics', { returnObjects: true }) as { name: string; city: string; specialties: string[] }[]
  const DEMO_CLINICS = demoClinicsRaw.map((c, i) => ({ ...c, doctors: DEMO_CLINIC_DOCTOR_COUNTS[i] }))

  const TESTIMONIALS = t('home.demo.testimonials', { returnObjects: true }) as { quote: string; name: string; role: string }[]

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

          <BookingPanel />
        </div>

        <div className="lp-marquee" aria-hidden>
          <div className="lp-marquee__track">
            {[...MARQUEE_PARTNERS, ...MARQUEE_PARTNERS].map((p, i) => (
              <span className="lp-marquee__item" key={`${p}-${i}`}>
                <ShieldCheck size={14} strokeWidth={1.75} /> {p}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ============ 2 — Stats ============ */}
      <section className="lp-section lp-section--flush">
        <div className="container lp-stats">
          {STATS.map((s) => (
            <Stat key={s.label} {...s} />
          ))}
        </div>
      </section>

      {/* ============ 3 — Specialties (gapless bento) ============ */}
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

        <div className="lp-bento" ref={specGridRef}>
          {(hasSpecs
            ? shownSpecs.map((s) => ({
                key: s.id,
                Icon: specialtyIcon(s.name),
                label: specialtyLabel(s.name),
                to: `/kerko?specialty=${s.id}`,
              }))
            : DEMO_SPECS.map((s) => ({
                key: s.key,
                Icon: s.icon,
                label: s.label,
                to: `/kerko?specialty=${encodeURIComponent(s.key)}`,
              }))
          ).map(({ key, Icon, label, to }) => (
            <button
              key={key}
              className="lp-bento__cell"
              data-reveal
              data-spotlight
              onClick={() => navigate(to)}
            >
              <span className="lp-bento__icon"><Icon size={22} strokeWidth={1.6} /></span>
              <span className="lp-bento__name">{label}</span>
              <span className="lp-bento__meta">{t('home.specialtiesSection.freeSlotsMeta')}</span>
              <ArrowUpRight className="lp-bento__arrow" size={16} strokeWidth={2.25} />
            </button>
          ))}
        </div>
      </section>

      {/* ============ 4 — How it works (asymmetric, sticky left) ============ */}
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

      {/* ============ 5 — Doctors (horizontal snap rail) ============ */}
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

        <div className="lp-rail" ref={doctorRailRef}>
          <div className="lp-rail__track">
            {hasDoctors
              ? shownDoctors.map((d) => (
                  <article className="lp-doc" key={d.id} data-reveal data-spotlight>
                    <span className="lp-doc__avatar">{initials(d.firstName, d.lastName)}</span>
                    <h3 className="lp-doc__name">
                      Dr. {d.firstName} {d.lastName} <VerifiedBadge title={t('home.doctorsSection.verified')} />
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
                    <Link to="/kerko?tab=mjeket" className="lp-btn lp-btn--ghost lp-btn--block">
                      {t('home.doctorsSection.browseSlots')}
                    </Link>
                  </article>
                ))
              : DEMO_DOCTORS.map((d) => (
                  <article className="lp-doc" key={d.name} data-reveal data-spotlight>
                    <span className="lp-doc__avatar">{initialsFromName(d.name)}</span>
                    <h3 className="lp-doc__name">
                      Dr. {d.name} <VerifiedBadge title={t('home.doctorsSection.verified')} />
                    </h3>
                    <div className="lp-tags">
                      <span className="lp-tag">{d.specialty}</span>
                    </div>
                    <p className="lp-doc__exp">{t('home.doctorsSection.experienceYears', { count: d.experience })}</p>
                    <p className="lp-doc__next">
                      <Clock size={13} strokeWidth={2} />
                      {t('home.doctorsSection.firstAppointment')} <b className="lp-num">{d.next}</b>
                    </p>
                    <Link to="/kerko?tab=mjeket" className="lp-btn lp-btn--ghost lp-btn--block">
                      {t('home.doctorsSection.browseSlots')}
                    </Link>
                  </article>
                ))}
          </div>
        </div>
      </section>

      {/* ============ 6 — Feature band ============ */}
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

      {/* ============ 7 — Clinics (asymmetric grid) ============ */}
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

        <div className="lp-clinics">
          {hasClinics
            ? shownClinics.map((c, i) => (
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
              ))
            : DEMO_CLINICS.map((c, i) => (
                <Link
                  to="/kerko?tab=klinika"
                  className={`lp-clinic ${i === 0 ? 'lp-clinic--feature' : ''}`}
                  key={c.name}
                  data-reveal
                >
                  <span className="lp-clinic__art" aria-hidden>
                    <Stethoscope size={i === 0 ? 34 : 24} strokeWidth={1.25} />
                  </span>
                  <span className="lp-clinic__body">
                    <h3>{c.name} <VerifiedBadge title={t('home.doctorsSection.verified')} /></h3>
                    <span className="lp-clinic__where">
                      <MapPin size={13} strokeWidth={2} /> {c.city}
                      <em className="lp-num">{t('home.clinicsSection.doctorCount', { count: c.doctors })}</em>
                    </span>
                    {i === 0 && (
                      <div className="lp-tags">
                        {c.specialties.map((s) => (
                          <span key={s} className="lp-tag">{s}</span>
                        ))}
                      </div>
                    )}
                    <span className="lp-clinic__cta">
                      {t('home.clinicsSection.viewClinic')} <ArrowUpRight size={16} strokeWidth={2.25} />
                    </span>
                  </span>
                </Link>
              ))}
        </div>
      </section>

      {/* ============ 8 — Testimonials ============ */}
      <section className="lp-section lp-section--soft">
        <div className="container">
          <div className="lp-head">
            <span className="lp-kicker" data-reveal>{t('home.testimonials.kicker')}</span>
            <h2 data-reveal>{t('home.testimonials.title')}</h2>
          </div>
          <div className="lp-quotes">
            {TESTIMONIALS.map((tItem) => (
              <figure className="lp-quote" key={tItem.name} data-reveal>
                <Quote className="lp-quote__mark" size={26} strokeWidth={1.5} aria-hidden />
                <blockquote>{tItem.quote}</blockquote>
                <figcaption>
                  <span className="lp-quote__avatar">{initialsFromName(tItem.name)}</span>
                  <span>
                    <strong>{tItem.name}</strong>
                    <em>{tItem.role}</em>
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ============ 9 — Final CTA ============ */}
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
