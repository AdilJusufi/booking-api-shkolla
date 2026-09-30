/**
 * Një mutex mes skedave për rotacionin e refresh token-it.
 *
 * Problemi që zgjidh: refresh token-i jeton në localStorage, pra e ndajnë të gjitha skedat,
 * por `refreshInFlight` te api.ts është variabël moduli — dedupikon vetëm BRENDA një skede.
 * Me dy skeda të hapura, të dyja e paraqesin të njëjtin token: e para e rrotullon me sukses,
 * e dyta paraqet një token tashmë të revokuar, dhe backend-i — krejt me të drejtë — e
 * trajton si vjedhje dhe i revokon TË GJITHA sesionet. Të dyja skedat dalin nga llogaria,
 * për një sjellje krejt të zakonshme.
 *
 * Zgjidhja është këtu, jo në backend: zbulimi i ripërdorimit atje po punon saktësisht siç
 * duhet, dhe zbutja e tij do të hiqte një mbrojtje reale për të mbuluar një defekt të
 * koordinimit në klient.
 *
 * Dy zbatime, i njëjti kontrat:
 *   • Web Locks API — mutex i vërtetë, dhe lirohet VETË nëse skeda mbyllet në mes të punës.
 *     Ky është dallimi kryesor; çdo skemë e ndërtuar mbi localStorage duhet ta imitojë atë
 *     me afat skadimi, dhe një afat është gjithmonë ose shumë i shkurtër ose shumë i gjatë.
 *   • Rezervë me localStorage — për shfletuesit pa Web Locks (Safari < 15.4). Blerja bëhet
 *     me shkrim-pastaj-rilexim: dy skeda mund të shkruajnë njëkohësisht, por vetëm shkrimi
 *     i fundit mbetet, prandaj vetëm njëra e sheh id-në e vet dhe fiton.
 */

const LOCK_NAME = 'rezervo.auth.refresh'

/** Sa gjatë mbahet i vlefshëm një bllokim i rezervës para se të quhet i braktisur. */
const FALLBACK_LOCK_TTL_MS = 15_000

/** Sa shpesh kontrollon një skedë pritëse nëse bllokimi u lirua. */
const FALLBACK_POLL_MS = 50

/**
 * Kufi i sipërm për pritjen. Një skedë që s'e merr dot bllokimit brenda kësaj kohe vazhdon
 * vetë: më mirë një rotacion i dyfishtë i rrallë (sjellja e sotme) sesa një kërkesë e
 * varur përgjithmonë.
 */
const MAX_WAIT_MS = 20_000

type LockRunner = <T>(fn: () => Promise<T>) => Promise<T>

function hasWebLocks(): boolean {
  return typeof navigator !== 'undefined' && 'locks' in navigator && navigator.locks != null
}

const withWebLock: LockRunner = (fn) =>
  navigator.locks.request(LOCK_NAME, { mode: 'exclusive' }, async () => fn())

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function readLock(): { id: string; at: number } | null {
  try {
    const raw = localStorage.getItem(LOCK_NAME)
    if (!raw) return null
    const [id, at] = raw.split(':')
    const timestamp = Number(at)
    return id && Number.isFinite(timestamp) ? { id, at: timestamp } : null
  } catch {
    return null
  }
}

function tryAcquireFallback(id: string): boolean {
  const held = readLock()
  if (held && Date.now() - held.at < FALLBACK_LOCK_TTL_MS) {
    return false
  }

  // Shkruaj, pastaj rilexo. localStorage s'ka compare-and-swap, por shkrimet janë
  // serike: nëse dy skeda shkruajnë njëkohësisht, mbijeton vetëm e fundit, ndaj vetëm
  // njëra do ta lexojë id-në e vet.
  localStorage.setItem(LOCK_NAME, `${id}:${Date.now()}`)
  return readLock()?.id === id
}

const withFallbackLock: LockRunner = async (fn) => {
  const id = Math.random().toString(36).slice(2)
  const deadline = Date.now() + MAX_WAIT_MS

  while (!tryAcquireFallback(id)) {
    if (Date.now() > deadline) {
      // Vazhdo pa bllokim në vend që të mbetesh pezull përgjithmonë.
      return fn()
    }
    await sleep(FALLBACK_POLL_MS)
  }

  try {
    return await fn()
  } finally {
    if (readLock()?.id === id) {
      localStorage.removeItem(LOCK_NAME)
    }
  }
}

/**
 * Ekzekuton <paramref name="fn"/> me garancinë se asnjë skedë tjetër e së njëjtës origjinë
 * s'e ekzekuton njëkohësisht.
 */
export function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return hasWebLocks() ? withWebLock(fn) : withFallbackLock(fn)
  } catch {
    // Web Locks mund të mos jetë i disponueshëm në disa kontekste (p.sh. sandbox);
    // mos e humb rifreskimin për shkak të mekanizmit të bllokimit.
    return fn()
  }
}
