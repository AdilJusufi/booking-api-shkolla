// Ngarkimi i nënshkruar direkt te Cloudinary — i përbashkët për logon e klinikës dhe
// foton e mjekut. Nënshkrimi vjen nga API-ja jonë (API secret-i s'del kurrë nga backend-i);
// këtu vetëm dërgohen fushat e nënshkruara dhe klasifikohen dështimet, që UI-ja të tregojë
// një mesazh të saktë në vend të një "ngarkimi dështoi" për çdo gjë.
import { ApiError } from './api'
import type { CloudinarySignature } from './types'

/** Fut një transformim Cloudinary menjëherë pas "/upload/"; URL-të e tjera mbeten siç janë. */
export function cloudinaryDisplayUrl(url: string, transform: string): string {
  return url.includes('/upload/') ? url.replace('/upload/', `/upload/${transform}/`) : url
}

/**
 * Foto katrore e prerë rreth fytyrës, në madhësinë që i duhet vendit ku shfaqet (×2 për
 * ekranet retina) — kurrë origjinali i plotë.
 */
export function doctorPhotoUrl(url: string, displayPx: number): string {
  const size = Math.min(400, Math.ceil(displayPx * 2))
  return cloudinaryDisplayUrl(url, `c_fill,g_face,w_${size},h_${size},f_auto,q_auto`)
}

/** Cloudinary e mori kërkesën dhe e refuzoi (format, madhësi, nënshkrim i skaduar). */
export class CloudinaryRejectedError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

/**
 * Dërgon skedarin me fushat e nënshkruara SAKTËSISHT siç erdhën nga serveri. Po t'i heqësh
 * ose t'i ndryshosh (folder, allowed_formats, max_file_size), nënshkrimi s'përputhet dhe
 * Cloudinary e refuzon — pra kufijtë s'anashkalohen dot nga klienti.
 */
export async function uploadSignedImage(signature: CloudinarySignature, file: File): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('api_key', signature.apiKey)
  formData.append('timestamp', String(signature.timestamp))
  formData.append('signature', signature.signature)
  formData.append('folder', signature.folder)
  formData.append('allowed_formats', signature.allowedFormats)
  formData.append('max_file_size', String(signature.maxFileSizeBytes))

  const res = await fetch(`https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`, {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new CloudinaryRejectedError(res.status, body?.error?.message ?? 'Cloudinary upload rejected')
  }
  const uploaded = (await res.json()) as { secure_url: string }
  return uploaded.secure_url
}

export type UploadFailureKind = 'not-configured' | 'forbidden' | 'rejected' | 'network' | 'other'

/**
 * Nga çfarëdo hapi të rrugës (nënshkrimi → Cloudinary → ruajtja) në llojin e dështimit.
 * fetch() hedh TypeError kur s'ka lidhje; ApiError me status 0 është e njëjta gjë te api.ts.
 */
export function classifyUploadError(error: unknown): UploadFailureKind {
  // 401 nga Cloudinary = api_key/secret i gabuar në server (nënshkrimi sapo u lëshua, s'është
  // i skaduar) — fajin s'e ka skedari, dhe riprovimi s'ndihmon.
  if (error instanceof CloudinaryRejectedError) return error.status === 401 ? 'not-configured' : 'rejected'
  if (error instanceof ApiError) {
    const code = (error.data as { code?: unknown } | null | undefined)?.code
    if (error.status === 503 && code === 'uploads-not-configured') return 'not-configured'
    if (error.status === 403) return 'forbidden'
    if (error.status === 0) return 'network'
    return 'other'
  }
  if (error instanceof TypeError) return 'network'
  return 'other'
}
