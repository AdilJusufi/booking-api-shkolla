import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import type { Specialty } from '../lib/types'
import { specialtyIcon, specialtyLabel } from '../components/ui'

const KOSOVO_CITIES = [
  'Prishtinë', 'Prizren', 'Pejë', 'Gjakovë', 'Gjilan',
  'Mitrovicë', 'Ferizaj', 'Vushtrri', 'Podujevë', 'Suharekë',
]

export default function HomePage() {
  const navigate = useNavigate()
  const [specialties, setSpecialties] = useState<Specialty[]>([])
  const [city, setCity] = useState('')
  const [specialtyId, setSpecialtyId] = useState('')

  useEffect(() => {
    api.getSpecialties().then(setSpecialties).catch(() => setSpecialties([]))
  }, [])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (city) params.set('qyteti', city)
    if (specialtyId) params.set('specialiteti', specialtyId)
    navigate(`/kerko?${params.toString()}`)
  }

  return (
    <>
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
                🔍 Kërko
              </button>
            </form>

            <div className="hero__trust">
              <span>✔ Pa pagesë</span>
              <span>✔ Konfirmim i menjëhershëm</span>
              <span>✔ Kujtesa për terminin</span>
            </div>
          </div>

          <div className="hero__art" aria-hidden>
            <div className="hero__card floaty">
              <div className="hero__card-avatar">AG</div>
              <div>
                <strong>Dr. Arben Gashi</strong>
                <span>🦷 Stomatologji · Prishtinë</span>
              </div>
              <span className="hero__card-badge">I lirë sot</span>
            </div>
            <div className="hero__card hero__card--slots floaty2">
              <strong>E hënë, 09:00</strong>
              <div className="hero__slots">
                <span>09:00</span><span className="on">09:30</span><span>10:00</span>
              </div>
              <button className="btn btn--primary btn--sm">Konfirmo terminin</button>
            </div>
          </div>
        </div>
      </section>

      <section className="section container">
        <div className="section__head">
          <h2>Specialitetet</h2>
          <p>Zgjidh fushën dhe gjej mjekun e duhur.</p>
        </div>
        <div className="spec-grid">
          {(specialties.length ? specialties : PLACEHOLDER_SPECS).map((s) => (
            <button
              key={s.id}
              className="spec-tile"
              onClick={() => navigate(`/kerko?specialiteti=${s.id}`)}
            >
              <span className="spec-tile__icon">{specialtyIcon(s.name)}</span>
              <span className="spec-tile__name">{specialtyLabel(s.name)}</span>
            </button>
          ))}
        </div>
      </section>

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
                <div className="step__icon" aria-hidden>{step.icon}</div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

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
    </>
  )
}

const STEPS = [
  { icon: '🔍', title: 'Kërko', text: 'Zgjidh qytetin dhe specialitetin që të nevojitet.' },
  { icon: '📅', title: 'Zgjidh orarin', text: 'Shiko oraret e lira dhe zgjidh atë që të përshtatet.' },
  { icon: '✅', title: 'Konfirmo', text: 'Merr konfirmimin menjëherë — pa pritje, pa telefonata.' },
]

const PLACEHOLDER_SPECS: Specialty[] = [
  { id: 'p1', name: 'Dentist' },
  { id: 'p2', name: 'Pediatrician' },
  { id: 'p3', name: 'Dermatologist' },
  { id: 'p4', name: 'Cardiologist' },
]
