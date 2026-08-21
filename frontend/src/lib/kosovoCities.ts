/**
 * Kosovo cities offered in dropdowns (registration, home/search filters).
 *
 * `value` is the stable identifier used wherever the city is actually
 * compared or stored — form submissions, search filters, PatientProfile.City
 * — and always stays this fixed Albanian spelling, matching the seed data
 * and existing records. Only the displayed *label* changes with the active
 * language, via common:cities.<key>. Without this split, the same city would
 * get stored/searched under three different spellings depending on which
 * language the user happened to be using, and nothing downstream (clinic
 * reports, search) could group them back together.
 */
export const KOSOVO_CITIES = [
  { key: 'pristina', value: 'Prishtinë' },
  { key: 'prizren', value: 'Prizren' },
  { key: 'peja', value: 'Pejë' },
  { key: 'gjakova', value: 'Gjakovë' },
  { key: 'gjilan', value: 'Gjilan' },
  { key: 'mitrovica', value: 'Mitrovicë' },
  { key: 'ferizaj', value: 'Ferizaj' },
  { key: 'vushtrri', value: 'Vushtrri' },
  { key: 'podujeva', value: 'Podujevë' },
  { key: 'suhareka', value: 'Suharekë' },
] as const
