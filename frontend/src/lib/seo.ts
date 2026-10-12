import type { ClinicDetails, DoctorDetails } from './types'

export const SITE_NAME = 'Rezervo Mjekun'

/** Google truncates descriptions around 155–160 characters; cut on a word boundary before that. */
export function truncateDescription(text: string, max = 155): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max - 1)
  return `${cut.slice(0, cut.lastIndexOf(' ') > 60 ? cut.lastIndexOf(' ') : cut.length).replace(/[,.;:\s]+$/, '')}…`
}

function uniqueCities(branches: { city: string }[]): string[] {
  return [...new Set(branches.map((b) => b.city).filter(Boolean))]
}

interface SeoText {
  /** i18n `patient:seo.*` lookups, injected so this module stays framework-free and unit-testable. */
  t: (key: string, values?: Record<string, string>) => string
  specialtyLabel: (name: string) => string
}

/** "Dr. Filan Fisteku — Dermatolog në Vushtrri | Rezervo Mjekun" */
export function doctorSeo(doctor: DoctorDetails, { t, specialtyLabel }: SeoText) {
  const name = `${doctor.firstName} ${doctor.lastName}`
  const specialty = doctor.specialties[0] ? specialtyLabel(doctor.specialties[0]) : ''
  const cities = uniqueCities(doctor.branches)

  const title =
    `Dr. ${name}` +
    (specialty ? ` — ${specialty}` : '') +
    (cities[0] ? ` ${t('seo.in')} ${cities[0]}` : '') +
    ` | ${SITE_NAME}`

  const summary = [doctor.specialties.map(specialtyLabel).join(', '), cities.length ? `${t('seo.in')} ${cities.join(', ')}` : '']
    .filter(Boolean)
    .join(' ')
  const generated = summary
    ? t('seo.doctorDescription', { name, summary })
    : t('seo.doctorDescriptionBare', { name })

  return { title, description: truncateDescription(generated) }
}

/** "Klinika Dardania — Klinikë në Prishtinë | Rezervo Mjekun" */
export function clinicSeo(clinic: ClinicDetails, { t }: SeoText) {
  const cities = uniqueCities(clinic.branches)

  const title =
    clinic.name + ` — ${t('seo.clinic')}` + (cities[0] ? ` ${t('seo.in')} ${cities[0]}` : '') + ` | ${SITE_NAME}`

  const place = cities.length ? ` ${t('seo.in')} ${cities.join(', ')}` : ''
  const description = clinic.description?.trim()
    ? clinic.description
    : t('seo.clinicDescription', { name: clinic.name, place })

  return { title, description: truncateDescription(description) }
}
