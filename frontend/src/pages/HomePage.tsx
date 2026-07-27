import { useEffect, useState } from 'react'
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
  HandHeart,
  Heart,
  Lock,
  MapPin,
  MessageCircleHeart,
  Quote,
  Scan,
  Search,
  ShieldCheck,
  SmilePlus,
  Star,
  Stethoscope,
  Venus,
  type LucideProps,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { api } from '../lib/api'
import type { Clinic, Doctor, Specialty } from '../lib/types'
import { initials, specialtyIcon, specialtyLabel } from '../components/ui'
import {
  useCountUp,
  useReveal,
  useRotatingIndex,
  useSpotlight,
  useScrollProgress,
} from '../lib/motion'

const KOSOVO_CITIES = [
  'Prishtinë', 'Prizren', 'Pejë', 'Gjakovë', 'Gjilan',
  'Mitrovicë', 'Ferizaj', 'Vushtrri', 'Podujevë', 'Suharekë',
]

/* ---------- Hardcoded demo fallbacks (marketing page must never look empty) ---------- */

type DemoSpec = { key: string; icon: ComponentType<LucideProps>; label: string }
const DEMO_SPECS: DemoSpec[] = [
  { key: 'Kardiologji', icon: Heart, label: 'Kardiologji' },
  { key: 'Pediatri', icon: Baby, label: 'Pediatri' },
  { key: 'Neurologji', icon: Brain, label: 'Neurologji' },
  { key: 'Ortopedi', icon: Bone, label: 'Ortopedi' },
  { key: 'Dermatologji', icon: Scan, label: 'Dermatologji' },
  { key: 'Gjinekologji', icon: Venus, label: 'Gjinekologji' },
  { key: 'Stomatologji', icon: SmilePlus, label: 'Stomatologji' },
  { key: 'Psikiatri', icon: MessageCircleHeart, label: 'Psikiatri' },
]

type DemoDoctor = { name: string; specialty: string; experience: number; next: string }
const DEMO_DOCTORS: DemoDoctor[] = [
  { name: 'Arben Vitia', specialty: 'Kardiologji', experience: 12, next: 'Sot, 14:30' },
  { name: 'Linda Gashi', specialty: 'Pediatri', experience: 8, next: 'Sot, 16:00' },
  { name: 'Besnik Ramadani', specialty: 'Neurologji', experience: 15, next: 'Nesër, 09:00' },
  { name: 'Teuta Krasniqi', specialty: 'Dermatologji', experience: 9, next: 'Nesër, 11:30' },
  { name: 'Driton Berisha', specialty: 'Ortopedi', experience: 17, next: 'E enjte, 08:30' },
]

type DemoClinic = { name: string; city: string; specialties: string[]; doctors: number }
const DEMO_CLINICS: DemoClinic[] = [
  { name: 'Spitali Amerikan', city: 'Prishtinë', specialties: ['Kardiologji', 'Pediatri', 'Neurologji'], doctors: 42 },
  { name: 'Poliklinika Rilindja', city: 'Prishtinë', specialties: ['Ortopedi', 'Dermatologji'], doctors: 18 },
  { name: 'Klinika Vita', city: 'Prizren', specialties: ['Gjinekologji', 'Pediatri'], doctors: 11 },
]

const STEPS = [
  {
    icon: Search,
    title: 'Kërko',
    text: 'Zgjidh qytetin dhe specialitetin që të nevojitet. Rezultatet filtrohen në çast, pa forma të gjata.',
  },
  {
    icon: CalendarDays,
    title: 'Zgjidh orarin',
    text: 'Shiko oraret e lira në kohë reale, drejt nga kalendari i klinikës. Asnjë orar i vjetruar.',
  },
  {
    icon: BadgeCheck,
    title: 'Konfirmo',
    text: 'Merr konfirmimin menjëherë dhe një kujtesë para termini. Anulo ose ndrysho kur të duash.',
  },
]

const STATS = [
  { to: 12400, suffix: '+', label: 'Termine të rezervuara' },
  { to: 340, suffix: '+', label: 'Mjekë të verifikuar' },
  { to: 62, suffix: '', label: 'Klinika partnere' },
  { to: 38, suffix: 's', label: 'Koha mesatare e rezervimit' },
]

const FEATURES = [
  { icon: Clock, big: '24/7', label: 'Rezervim online, edhe natën' },
  { icon: ShieldCheck, big: 'GDPR', label: 'Të dhëna të enkriptuara' },
  { icon: HandHeart, big: 'Falas', label: 'Gjithmonë për pacientët' },
  { icon: MapPin, big: '7 rajone', label: 'Mbulim në gjithë Kosovën' },
]

const MARQUEE_PARTNERS = [
  'Spitali Amerikan', 'Poliklinika Rilindja', 'Klinika Vita', 'Dental Art',
  'Medica Group', 'Bio Care', 'Klinika Sanus', 'Pediatria Lira',
]

const TESTIMONIALS = [
  {
    quote:
      'Kam rezervuar terminin te kardiologu në më pak se një minutë, në mbrëmje, pa telefonuar askënd. Konfirmimi erdhi menjëherë.',
    name: 'Blerta Hoxha',
    role: 'Pacient · Prishtinë',
  },
  {
    quote:
      'Si klinikë, kalendarin e kemi tani në një vend. Terminet e humbura na janë ulur ndjeshëm që kur kaluam te Termini.ks.',
    name: 'Dr. Fatos Kelmendi',
    role: 'Drejtor klinike · Prizren',
  },
]

/* Hero headline punctuation — decorative, seeded so the URLs never break. */
const INLINE_IMAGES = [
  { seed: 'termini-clinic', alt: '' },
  { seed: 'termini-care', alt: '' },
]

const PANEL_SLOTS = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30']
const PANEL_DAYS = [
  { d: 'Hën', n: '12' },
  { d: 'Mar', n: '13' },
  { d: 'Mër', n: '14' },
  { d: 'Enj', n: '15' },
  { d: 'Pre', n: '16' },
]

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.charAt(0) ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : ''
  return `${first}${last}`.toUpperCase()
}

const VerifiedBadge = () => (
  <span className="lp-verified" title="I verifikuar">
    <BadgeCheck size={15} strokeWidth={2} />
  </span>
)

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

/** Small contextual photo set inline with the headline, at type height. */
function InlineImage({ seed, alt, index }: { seed: string; alt: string; index: number }) {
  return (
    <span className="lp-word lp-inline-img" style={{ ['--w' as string]: index }} aria-hidden={!alt}>
      <img src={`https://picsum.photos/seed/${seed}/240/160`} alt={alt} loading="lazy" />
    </span>
  )
}

function Stat({ to, suffix, label }: { to: number; suffix: string; label: string }) {
  const { ref, value } = useCountUp(to)
  return (
    <div className="lp-stat" data-reveal>
      <span className="lp-stat__value">
        <span ref={ref}>{value.toLocaleString('sq')}</span>
        {suffix}
      </span>
      <span className="lp-stat__label">{label}</span>
    </div>
  )
}

/** The hero's proof object: one surface, no stacking, showing a real booking flow. */
function BookingPanel() {
  const activeSlot = useRotatingIndex(PANEL_SLOTS.length, 2600)
  const activeDay = useRotatingIndex(PANEL_DAYS.length, 7800)

  return (
    <aside className="lp-panel" data-reveal aria-label="Shembull i rezervimit">
      <header className="lp-panel__head">
        <span className="lp-panel__avatar">AG</span>
        <span className="lp-panel__who">
          <strong>Dr. Arben Gashi</strong>
          <span>Stomatologji · Prishtinë</span>
        </span>
        <span className="lp-panel__live">
          <i className="lp-dot" aria-hidden /> I lirë
        </span>
      </header>

      <div className="lp-panel__days" role="presentation">
        {PANEL_DAYS.map((day, i) => (
          <span key={day.n} className={`lp-day ${i === activeDay ? 'is-on' : ''}`}>
            <em>{day.d}</em>
            <b>{day.n}</b>
          </span>
        ))}
      </div>

      <div className="lp-panel__slots">
        <div className="lp-panel__row">
          <span className="lp-panel__label">Oraret e lira</span>
          <span className="lp-panel__count">
            {PANEL_SLOTS.length} terme
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
        Konfirmo terminin
      </Link>

      <footer className="lp-panel__foot">
        <span className="lp-stars" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <Star key={i} size={13} strokeWidth={0} fill="currentColor" />
          ))}
        </span>
        <strong>4.9</strong>
        <span className="lp-panel__reviews">nga 2.184 pacientë</span>
      </footer>
    </aside>
  )
}

export default function HomePage() {
  const navigate = useNavigate()
  const [specialties, setSpecialties] = useState<Specialty[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [clinics, setClinics] = useState<Clinic[]>([])
  const [city, setCity] = useState('')
  const [specialtyId, setSpecialtyId] = useState('')

  const pageRef = useReveal<HTMLDivElement>()
  const specGridRef = useSpotlight<HTMLDivElement>()
  const doctorRailRef = useSpotlight<HTMLDivElement>()
  const progress = useScrollProgress()

  useEffect(() => {
    api.getSpecialties().then((s) => setSpecialties(s ?? [])).catch(() => setSpecialties([]))
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

  const shownDoctors = hasDoctors ? doctors.slice(0, 6) : []
  const shownClinics = hasClinics ? clinics.slice(0, 3) : []
  const shownSpecs = hasSpecs ? specialties.slice(0, 8) : []

  return (
    <div className="lp" ref={pageRef}>
      <div className="lp-progress" style={{ transform: `scaleX(${progress})` }} aria-hidden />

      {/* ============ 1 — Hero ============ */}
      <section className="lp-hero">
        <div className="lp-hero__rules" aria-hidden />

        <div className="container lp-hero__inner">
          <div className="lp-hero__content">
            <span className="lp-eyebrow" data-reveal>
              <i className="lp-dot" aria-hidden /> 62 klinika · 340 mjekë · Kosovë
            </span>

            <h1 className="lp-hero__title">
              <SplitWords text="Rezervo terminin" />
              <InlineImage {...INLINE_IMAGES[0]} index={2} />
              <SplitWords text="te mjeku" from={3} />
              <span className="lp-word lp-word--accent" style={{ ['--w' as string]: 5 }}>
                online
              </span>
              <InlineImage {...INLINE_IMAGES[1]} index={6} />
              <SplitWords text="pa telefonata." from={7} />
            </h1>

            <div className="lp-hero__strip" aria-hidden>
              {INLINE_IMAGES.map((img) => (
                <img
                  key={img.seed}
                  src={`https://picsum.photos/seed/${img.seed}/240/160`}
                  alt=""
                  loading="lazy"
                />
              ))}
            </div>

            <p className="lp-hero__lead" data-reveal>
              Gjej klinikën më të afërt, shiko oraret reale të mjekut dhe konfirmo terminin
              për pak sekonda — falas dhe në shqip.
            </p>

            <form className="lp-search" onSubmit={handleSearch} data-reveal>
              <div className="lp-search__field">
                <label htmlFor="city">Qyteti</label>
                <select id="city" value={city} onChange={(e) => setCity(e.target.value)}>
                  <option value="">Të gjitha qytetet</option>
                  {KOSOVO_CITIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <span className="lp-search__divider" aria-hidden />
              <div className="lp-search__field">
                <label htmlFor="spec">Specialiteti</label>
                <select id="spec" value={specialtyId} onChange={(e) => setSpecialtyId(e.target.value)}>
                  <option value="">Të gjitha specialitetet</option>
                  {specialties.map((s) => (
                    <option key={s.id} value={s.id}>{specialtyLabel(s.name)}</option>
                  ))}
                </select>
              </div>
              <button type="submit" className="lp-btn lp-btn--accent lp-search__submit">
                <Search size={16} strokeWidth={2.25} /> Kërko
              </button>
            </form>

            <ul className="lp-hero__trust" data-reveal>
              <li><Check size={15} strokeWidth={2.5} /> Pa pagesë për pacientët</li>
              <li><Check size={15} strokeWidth={2.5} /> Konfirmim i menjëhershëm</li>
              <li><Lock size={15} strokeWidth={2.5} /> Të dhëna të enkriptuara</li>
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
            <span className="lp-kicker">Specialitetet</span>
            <h2>Kujdes i specializuar, i verifikuar një nga një</h2>
            <p>Zgjidh fushën dhe shiko menjëherë cilët mjekë kanë orare të lira këtë javë.</p>
          </div>
          <Link to="/kerko" className="lp-link" data-reveal>
            Shih të gjitha <ChevronRight size={16} strokeWidth={2.25} />
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
              <span className="lp-bento__meta">Orare të lira</span>
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
              <span className="lp-kicker" data-reveal>Procesi</span>
              <h2 data-reveal>Tre hapa deri te termini yt</h2>
              <p data-reveal>
                Pa telefonata, pa pritje në sportel, pa letra. Mesatarja e pacientëve
                tanë është <b className="lp-num">38 sekonda</b> nga kërkimi te konfirmimi.
              </p>
              <Link to="/kerko" className="lp-btn lp-btn--accent lp-how__cta" data-reveal>
                Fillo tani <ArrowRight size={16} strokeWidth={2.25} />
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
            <span className="lp-kicker">Mjekët</span>
            <h2>Profesionistë me licencë të kontrolluar</h2>
            <p>Orare reale nga kalendari i klinikës, konfirmim i menjëhershëm.</p>
          </div>
          <Link to="/kerko?tab=mjeket" className="lp-link" data-reveal>
            Të gjithë mjekët <ChevronRight size={16} strokeWidth={2.25} />
          </Link>
        </div>

        <div className="lp-rail" ref={doctorRailRef}>
          <div className="lp-rail__track">
            {hasDoctors
              ? shownDoctors.map((d) => (
                  <article className="lp-doc" key={d.id} data-reveal data-spotlight>
                    <span className="lp-doc__avatar">{initials(d.firstName, d.lastName)}</span>
                    <h3 className="lp-doc__name">
                      Dr. {d.firstName} {d.lastName} <VerifiedBadge />
                    </h3>
                    <div className="lp-tags">
                      {d.specialties.slice(0, 1).map((s) => (
                        <span key={s} className="lp-tag">{specialtyLabel(s)}</span>
                      ))}
                    </div>
                    <p className="lp-doc__exp">
                      {d.yearsOfExperience > 0
                        ? `${d.yearsOfExperience} vjet përvojë`
                        : 'Mjek i licencuar'}
                    </p>
                    <Link to="/kerko?tab=mjeket" className="lp-btn lp-btn--ghost lp-btn--block">
                      Shfleto oraret
                    </Link>
                  </article>
                ))
              : DEMO_DOCTORS.map((d) => (
                  <article className="lp-doc" key={d.name} data-reveal data-spotlight>
                    <span className="lp-doc__avatar">{initialsFromName(d.name)}</span>
                    <h3 className="lp-doc__name">
                      Dr. {d.name} <VerifiedBadge />
                    </h3>
                    <div className="lp-tags">
                      <span className="lp-tag">{d.specialty}</span>
                    </div>
                    <p className="lp-doc__exp">{d.experience} vjet përvojë</p>
                    <p className="lp-doc__next">
                      <Clock size={13} strokeWidth={2} />
                      Termini i parë: <b className="lp-num">{d.next}</b>
                    </p>
                    <Link to="/kerko?tab=mjeket" className="lp-btn lp-btn--ghost lp-btn--block">
                      Shfleto oraret
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
            <span className="lp-kicker">Klinikat</span>
            <h2>Klinika të besuara në gjithë Kosovën</h2>
            <p>Nga qendrat spitalore te praktikat familjare të lagjes.</p>
          </div>
          <Link to="/kerko?tab=klinika" className="lp-link" data-reveal>
            Shih të gjitha <ChevronRight size={16} strokeWidth={2.25} />
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
                      Shiko klinikën <ArrowUpRight size={16} strokeWidth={2.25} />
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
                    <h3>{c.name} <VerifiedBadge /></h3>
                    <span className="lp-clinic__where">
                      <MapPin size={13} strokeWidth={2} /> {c.city}
                      <em className="lp-num">{c.doctors} mjekë</em>
                    </span>
                    {i === 0 && (
                      <div className="lp-tags">
                        {c.specialties.map((s) => (
                          <span key={s} className="lp-tag">{s}</span>
                        ))}
                      </div>
                    )}
                    <span className="lp-clinic__cta">
                      Shiko klinikën <ArrowUpRight size={16} strokeWidth={2.25} />
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
            <span className="lp-kicker" data-reveal>Dëshmi</span>
            <h2 data-reveal>Të besuar nga pacientë dhe klinika</h2>
          </div>
          <div className="lp-quotes">
            {TESTIMONIALS.map((t) => (
              <figure className="lp-quote" key={t.name} data-reveal>
                <Quote className="lp-quote__mark" size={26} strokeWidth={1.5} aria-hidden />
                <blockquote>{t.quote}</blockquote>
                <figcaption>
                  <span className="lp-quote__avatar">{initialsFromName(t.name)}</span>
                  <span>
                    <strong>{t.name}</strong>
                    <em>{t.role}</em>
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
            <span className="lp-kicker lp-kicker--invert">Falas për pacientët</span>
            <h2>Gati për terminin tënd?</h2>
            <p>
              Krijo llogari falas dhe menaxho të gjitha terminet në një vend — për ty
              dhe familjen tënde.
            </p>
            <Link to="/kerko" className="lp-btn lp-btn--accent lp-btn--lg">
              Gjej mjek tani <ArrowRight size={17} strokeWidth={2.25} />
            </Link>
            <span className="lp-cta__fine">
              Pa kartë krediti · Anulim i lirë · Mbështetje në shqip
            </span>
          </div>
        </div>
      </section>
    </div>
  )
}
