// Mirrors the fallback logic in lib/api.ts so MSW handlers always intercept
// the same base URL the app code actually requests against, regardless of
// what VITE_API_URL resolves to in this environment.
export const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5080'
