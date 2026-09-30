import { describe, expect, it } from 'vitest'
import sq from '../locales/sq/patient.json'
import { clinicSeo, doctorSeo, truncateDescription } from './seo'
import { buildClinic, buildDoctor } from '../test/fixtures'
import type { ClinicDetails, DoctorDetails } from './types'

// Same static sq copy the app ships, so a translation edit can't silently desync these expectations.
const seo = sq.seo as Record<string, string>
const text = {
  t: (key: string, values: Record<string, string> = {}) =>
    (seo[key.replace('seo.', '')] ?? key).replace(/\{\{(\w+)\}\}/g, (_, k: string) => values[k] ?? ''),
  specialtyLabel: (name: string) => name,
}

const branch = (city: string) => ({ id: 'b', clinicId: 'c', name: 'Dega', address: 'Rr. 1', city })
const doctor = (over: Partial<DoctorDetails> = {}): DoctorDetails => ({
  ...buildDoctor({ firstName: 'Filan', lastName: 'Fisteku' }),
  biography: undefined,
  branches: [{ ...branch('Vushtrri'), branchId: 'b', branchName: 'Dega', clinicId: 'c', clinicName: 'K' }],
  services: [],
  specialties: ['Dermatolog'],
  ...over,
} as unknown as DoctorDetails)

describe('doctorSeo', () => {
  it('builds the "Dr. Name — Specialty në City | Rezervo Mjekun" title', () => {
    expect(doctorSeo(doctor(), text).title).toBe('Dr. Filan Fisteku — Dermatolog në Vushtrri | Rezervo Mjekun')
  })

  it('degrades cleanly when specialty or city is missing', () => {
    expect(doctorSeo(doctor({ specialties: [] }), text).title).toBe('Dr. Filan Fisteku në Vushtrri | Rezervo Mjekun')
    expect(doctorSeo(doctor({ branches: [] }), text).title).toBe('Dr. Filan Fisteku — Dermatolog | Rezervo Mjekun')
  })

  it('is unique per doctor and stays within the description budget', () => {
    const a = doctorSeo(doctor(), text)
    const b = doctorSeo(doctor({ firstName: 'Tjetër' } as Partial<DoctorDetails>), text)
    expect(a.description).not.toBe(b.description)
    expect(a.description.length).toBeLessThanOrEqual(155)
  })
})

describe('clinicSeo', () => {
  const clinic = (over: Partial<ClinicDetails> = {}): ClinicDetails => ({
    ...buildClinic({ name: 'Klinika Dardania' }),
    branches: [branch('Prishtinë'), branch('Prishtinë'), branch('Prizren')],
    services: [],
    ...over,
  } as unknown as ClinicDetails)

  it('uses the first city in the title and every unique city in the fallback description', () => {
    const { title, description } = clinicSeo(clinic({ description: undefined }), text)
    expect(title).toBe('Klinika Dardania — Klinikë në Prishtinë | Rezervo Mjekun')
    expect(description).toContain('në Prishtinë, Prizren')
  })

  it('prefers the clinic’s own description when it wrote one', () => {
    expect(clinicSeo(clinic({ description: 'Klinikë dentare me 20 vjet përvojë.' }), text).description)
      .toBe('Klinikë dentare me 20 vjet përvojë.')
  })
})

describe('truncateDescription', () => {
  it('cuts long text on a word boundary with an ellipsis, and leaves short text alone', () => {
    const long = 'fjalë '.repeat(60)
    const cut = truncateDescription(long)
    expect(cut.length).toBeLessThanOrEqual(155)
    expect(cut.endsWith('…')).toBe(true)
    expect(truncateDescription('E shkurtër.')).toBe('E shkurtër.')
  })
})
