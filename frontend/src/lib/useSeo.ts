import { useEffect } from 'react'

export interface SeoMeta {
  title: string
  description?: string
  /** For pages that must not be indexed (e.g. a not-found state, which the server still answers with HTTP 200). */
  noindex?: boolean
}

/** Sets a <meta>, creating it if absent, and returns a function that puts the page back the way it was. */
function upsertMeta(attr: 'name' | 'property', key: string, content: string): () => void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
    const created = el
    created.content = content
    return () => created.remove()
  }
  const previous = el.content
  el.content = content
  return () => {
    el.content = previous
  }
}

function upsertCanonical(href: string): () => void {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!el) {
    el = document.createElement('link')
    el.rel = 'canonical'
    document.head.appendChild(el)
    const created = el
    created.href = href
    return () => created.remove()
  }
  const previous = el.href
  el.href = href
  return () => {
    el.href = previous
  }
}

/**
 * Per-page <title>, description, canonical URL and Open Graph tags for the client-rendered app.
 * Restores whatever the previous page had on unmount, so navigating away never leaves a stale
 * "Dr. X" title behind. Pass null while the data is still loading — nothing is touched until then.
 *
 * Note this runs in the browser: Google renders JavaScript and reads it; crawlers that don't
 * (WhatsApp/Facebook link previews) only ever see the static tags in index.html.
 */
export function useSeo(meta: SeoMeta | null) {
  const title = meta?.title
  const description = meta?.description
  const noindex = meta?.noindex

  useEffect(() => {
    if (!title) return
    const restores: (() => void)[] = []

    const previousTitle = document.title
    document.title = title
    restores.push(() => {
      document.title = previousTitle
    })

    const url = `${window.location.origin}${window.location.pathname}`
    restores.push(upsertCanonical(url))
    restores.push(upsertMeta('property', 'og:title', title))
    restores.push(upsertMeta('property', 'og:url', url))
    restores.push(upsertMeta('property', 'og:type', 'website'))
    if (description) {
      restores.push(upsertMeta('name', 'description', description))
      restores.push(upsertMeta('property', 'og:description', description))
    }
    if (noindex) restores.push(upsertMeta('name', 'robots', 'noindex'))

    return () => restores.reverse().forEach((r) => r())
  }, [title, description, noindex])
}
