import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Baby,
  BadgeCheck,
  Bone,
  Brain,
  CalendarDays,
  CheckCircle,
  ChevronRight,
  Clock,
  HandHeart,
  Heart,
  MapPin,
  MessageCircleHeart,
  Scan,
  Search,
  ShieldCheck,
  SmilePlus,
  Venus,
  type LucideProps,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { api } from '../lib/api'
import type { Clinic, Doctor, Specialty } from '../lib/types'
import { initials, specialtyIcon, specialtyLabel } from '../components/ui'

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

type DemoDoctor = { name: string; specialty: string; experience: number }
const DEMO_DOCTORS: DemoDoctor[] = [
  { name: 'Arben Vitia', specialty: 'Kardiologji', experience: 12 },
  { name: 'Linda Gashi', specialty: 'Pediatri', experience: 8 },
  { name: 'Besnik Ramadani', specialty: 'Neurologji', experience: 15 },
]

type DemoClinic = { name: string; city: string; specialties: string[] }
const DEMO_CLINICS: DemoClinic[] = [
  { name: 'Spitali Amerikan', city: 'Prishtinë', specialties: ['Kardiologji', 'Pediatri', 'Neurologji'] },
  { name: 'Poliklinika Rilindja', city: 'Prishtinë', specialties: ['Ortopedi', 'Dermatologji'] },
  { name: 'Klinika Vita', city: 'Prizren', specialties: ['Gjinekologji', 'Pediatri'] },
]

const STEPS = [
  { icon: Search, title: 'Kërko', text: 'Zgjidh qytetin dhe specialitetin që të nevojitet.' },
  { icon: CalendarDays, title: 'Zgjidh orarin', text: 'Shiko oraret e lira dhe zgjidh atë që të përshtatet.' },
  { icon: BadgeCheck, title: 'Konfirmo', text: 'Merr konfirmimin menjëherë — pa pritje, pa telefonata.' },
]

const FEATURES = [
  { icon: Clock, big: '24/7', label: 'Rezervim online' },
  { icon: ShieldCheck, big: '100%', label: 'Të dhëna të sigurta' },
  { icon: HandHeart, big: 'Falas', label: 'Për pacientët' },
  { icon: MapPin, big: 'Kudo', label: 'Në gjithë Kosovën' },
]

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.charAt(0) ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : ''
  return `${first}${last}`.toUpperCase()
}

const VerifiedBadge = () => (
  <span className="verified-badge" aria-label="I verifikuar">
    <BadgeCheck size={16} strokeWidth={1.5} color="#2563eb" />
  </span>
)

export default function HomePage() {
  const navigate = useNavigate()
  const [specialties, setSpecialties] = useState<Specialty[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [clinics, setClinics] = useState<Clinic[]>([])
  const [city, setCity] = useState('')
  const [specialtyId, setSpecialtyId] = useState('')

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

  const shownDoctors = hasDoctors ? doctors.slice(0, 3) : []
  const shownClinics = hasClinics ? clinics.slice(0, 3) : []
  const shownSpecs = hasSpecs ? specialties.slice(0, 8) : []

  return (
    <>
      {/* ============ Section 1 — Hero ============ */}
      <section className="hero">
        <div className="container hero__inner">
          <div className="hero__content">
            <span className="hero__eyebrow">Shëndeti yt, pa radhë</span>
            <h1 className="hero__title">
              Rezervo terminin te mjeku <span className="hl">online</span>, pa telefonata.
            </h1>
            <p className="hero__lead">
              Gjej klinikën më të afërt, zgjidh orarin që të përshtatet dhe konfirmo terminin
              për pak sekonda — falas dhe në shqip.
            </p>

            <form className="searchbar" onSubmit={handleSearch}>
              <div className="searchbar__field">
                <label htmlFor="city">Qyteti</label>
                <select id="city" value={city} onChange={(e) => setCity(e.target.value)}>
                  <option value="">Të gjitha qytetet</option>
                  {KOSOVO_CITIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="searchbar__field">
                <label htmlFor="spec">Specialiteti</label>
                <select id="spec" value={specialtyId} onChange={(e) => setSpecialtyId(e.target.value)}>
                  <option value="">Të gjitha specialitetet</option>
                  {specialties.map((s) => (
                    <option key={s.id} value={s.id}>{specialtyLabel(s.name)}</option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn btn--primary btn--lg searchbar__submit">
                <Search size={16} strokeWidth={1.5} /> Kërko
              </button>
            </form>

            <div className="hero__trust">
              <span><CheckCircle size={18} strokeWidth={1.5} /> Pa pagesë</span>
              <span><CheckCircle size={18} strokeWidth={1.5} /> Konfirmim i menjëhershëm</span>
              <span><CheckCircle size={18} strokeWidth={1.5} /> Kujtesa për terminin</span>
            </div>
          </div>

          <div className="hero__art" aria-hidden>
            <div className="hero__doctor-circle">AG</div>
            <div className="hero__card floaty">
              <div className="hero__card-avatar">AG</div>
              <div>
                <strong>Dr. Arben Gashi</strong>
                <span><SmilePlus size={18} strokeWidth={1.5} /> Stomatologji · Prishtinë</span>
              </div>
              <span className="hero__card-badge">I lirë sot</span>
            </div>
            <div className="hero__card hero__card--slots floaty2">
              <strong>E hënë, 09:00</strong>
              <div className="hero__slots hero__slots--grid">
                <span>09:00</span><span>09:30</span><span>10:00</span>
                <span className="on">10:30</span><span>11:00</span><span>11:30</span>
              </div>
              <button className="btn btn--primary btn--sm">Konfirmo terminin</button>
            </div>
          </div>
        </div>
      </section>

      {/* ============ Section 2 — Specialties ============ */}
      <section className="section container">
        <div className="section__head section__head--row">
          <div>
            <h2>Specialitetet</h2>
            <p>Zgjidh fushën dhe gjej mjekun e duhur.</p>
          </div>
          <Link to="/kerko" className="section__link">
            Shih të gjitha <ChevronRight size={16} strokeWidth={1.5} />
          </Link>
        </div>
        <div className="spec-grid">
          {hasSpecs
            ? shownSpecs.map((s) => {
                const Icon = specialtyIcon(s.name)
                return (
                  <button
                    key={s.id}
                    className="spec-tile"
                    onClick={() => navigate(`/kerko?specialty=${s.id}`)}
                  >
                    <span className="spec-tile__icon"><Icon size={28} strokeWidth={1.5} /></span>
                    <span className="spec-tile__name">{specialtyLabel(s.name)}</span>
                    <span className="spec-tile__meta">Të disponueshme</span>
                  </button>
                )
              })
            : DEMO_SPECS.map((s) => (
                <button
                  key={s.key}
                  className="spec-tile"
                  onClick={() => navigate(`/kerko?specialty=${encodeURIComponent(s.key)}`)}
                >
                  <span className="spec-tile__icon"><s.icon size={28} strokeWidth={1.5} /></span>
                  <span className="spec-tile__name">{s.label}</span>
                  <span className="spec-tile__meta">Të disponueshme</span>
                </button>
              ))}
        </div>
      </section>

      {/* ============ Section 3 — How it works ============ */}
      <section className="section section--soft">
        <div className="container">
          <div className="section__head">
            <h2>Si funksionon</h2>
            <p>Tre hapa të thjeshtë deri te termini yt.</p>
          </div>
          <div className="steps">
            {STEPS.map((step, i) => (
              <div className="step" key={step.title}>
                <div className="step__num">{i + 1}</div>
                <div className="step__icon" aria-hidden>
                  <step.icon size={32} strokeWidth={1.5} />
                </div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ Section 4 — Featured doctors ============ */}
      <section className="section container">
        <div className="section__head section__head--row">
          <div>
            <h2>Mjekët e rekomanduar</h2>
            <p>Profesionistë të verifikuar, gati t'ju ndihmojnë.</p>
          </div>
          <Link to="/kerko?tab=mjeket" className="section__link">
            Shikoni të gjithë mjekët <ChevronRight size={16} strokeWidth={1.5} />
          </Link>
        </div>
        <div className="grid grid--cards">
          {hasDoctors
            ? shownDoctors.map((d) => (
                <div className="card doctor-card" key={d.id}>
                  <div className="doctor-card__avatar doctor-card__avatar--blend">
                    {initials(d.firstName, d.lastName)}
                  </div>
                  <h3 className="doctor-card__name">Dr. {d.firstName} {d.lastName}</h3>
                  <div className="doctor-card__specs">
                    {d.specialties.slice(0, 1).map((s) => (
                      <span key={s} className="chip">{specialtyLabel(s)}</span>
                    ))}
                  </div>
                  <p className="doctor-card__exp">
                    {d.yearsOfExperience > 0 ? `${d.yearsOfExperience} vjet përvojë` : 'Mjek i licencuar'}
                  </p>
                  <Link to="/kerko?tab=mjeket" className="btn btn--ghost btn--sm btn--block">Shfleto</Link>
                </div>
              ))
            : DEMO_DOCTORS.map((d) => (
                <div className="card doctor-card" key={d.name}>
                  <div className="doctor-card__avatar doctor-card__avatar--blend">
                    {initialsFromName(d.name)}
                  </div>
                  <h3 className="doctor-card__name">
                    Dr. {d.name} <VerifiedBadge />
                  </h3>
                  <div className="doctor-card__specs">
                    <span className="chip">{d.specialty}</span>
                  </div>
                  <p className="doctor-card__exp">{d.experience} vjet përvojë</p>
                  <Link to="/kerko?tab=mjeket" className="btn btn--ghost btn--sm btn--block">Shfleto</Link>
                </div>
              ))}
        </div>
      </section>

      {/* ============ Section 5 — Feature callouts (blue block) ============ */}
      <section className="feature-band">
        <div className="container feature-band__grid">
          {FEATURES.map((f) => (
            <div className="feature-band__item" key={f.label}>
              <span className="feature-band__icon" aria-hidden>
                <f.icon size={32} strokeWidth={1.5} />
              </span>
              <span className="feature-band__big">{f.big}</span>
              <span className="feature-band__label">{f.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ============ Section 6 — Featured clinics ============ */}
      <section className="section container">
        <div className="section__head section__head--row">
          <div>
            <h2>Klinikat e njohura</h2>
            <p>Klinika të besuara në gjithë Kosovën.</p>
          </div>
          <Link to="/kerko?tab=klinika" className="section__link">
            Shih të gjitha <ChevronRight size={16} strokeWidth={1.5} />
          </Link>
        </div>
        <div className="grid grid--cards">
          {hasClinics
            ? shownClinics.map((c) => (
                <Link to={`/klinika/${c.id}`} className="card clinic-card" key={c.id}>
                  <div className="clinic-card__banner clinic-card__banner--blend" aria-hidden>
                    {c.name.charAt(0)}
                  </div>
                  <div className="clinic-card__body">
                    <h3 className="clinic-card__name">{c.name}</h3>
                    <div className="clinic-card__meta">
                      {c.cities.length > 0 && (
                        <span className="chip chip--soft">
                          <MapPin size={14} strokeWidth={1.5} /> {c.cities.join(', ')}
                        </span>
                      )}
                    </div>
                    <span className="clinic-card__cta">
                      Shiko klinikën <ArrowRight size={16} strokeWidth={1.5} />
                    </span>
                  </div>
                </Link>
              ))
            : DEMO_CLINICS.map((c) => (
                <Link to="/kerko?tab=klinika" className="card clinic-card" key={c.name}>
                  <div className="clinic-card__banner clinic-card__banner--blend" aria-hidden>
                    {c.name.charAt(0)}
                  </div>
                  <div className="clinic-card__body">
                    <h3 className="clinic-card__name">{c.name} <VerifiedBadge /></h3>
                    <div className="clinic-card__meta">
                      <span className="chip chip--soft">
                        <MapPin size={14} strokeWidth={1.5} /> {c.city}
                      </span>
                    </div>
                    <div className="clinic-card__meta">
                      {c.specialties.map((s) => (
                        <span key={s} className="chip">{s}</span>
                      ))}
                    </div>
                    <span className="clinic-card__cta">
                      Shiko klinikën <ArrowRight size={16} strokeWidth={1.5} />
                    </span>
                  </div>
                </Link>
              ))}
        </div>
      </section>

      {/* ============ Section 7 — Teal CTA ============ */}
      <section className="section container">
        <div className="cta">
          <div>
            <h2>Gati për terminin tënd?</h2>
            <p>Krijo llogari falas dhe menaxho të gjitha terminet në një vend.</p>
          </div>
          <button className="btn btn--light btn--lg" onClick={() => navigate('/regjistrohu')}>
            Krijo llogari falas
          </button>
        </div>
      </section>

      {/* ============ Section 8 — Final CTA ============ */}
      <section className="section section--soft">
        <div className="container final-cta">
          <h2>Filloni sot me Termini.ks</h2>
          <p>Mijëra pacientë e kanë bërë tashmë rezervimin online — bashkohuni edhe ju.</p>
          <div className="final-cta__actions">
            <Link to="/kerko" className="btn btn--primary btn--lg">
              Gjeni mjek <ArrowRight size={16} strokeWidth={1.5} />
            </Link>
            <Link to="/regjistrohu" className="btn btn--ghost btn--lg">Regjistrohu falas</Link>
          </div>
        </div>
      </section>
    </>
  )
}
