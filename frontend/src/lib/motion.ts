import { useEffect, useRef, useState } from 'react'

/** True when the user asked the OS to reduce motion. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Adds `is-in` to every `[data-reveal]` inside the returned ref once it scrolls
 * into view. Staggering is done in CSS via `--reveal-i` (set per element here).
 *
 * Targets are (re)collected via a MutationObserver rather than once on mount —
 * list pages attach this ref before their data has loaded, so the cards that
 * matter don't exist in the DOM yet on the first (and, without this, only)
 * scan. Without watching for new nodes, those elements never get observed,
 * never get `.is-in`, and sit permanently at `opacity: 0` per the CSS rule.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const root = ref.current
    if (!root) return

    const reduced = prefersReducedMotion()
    const seen = new WeakSet<HTMLElement>()

    const io = reduced
      ? null
      : new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (!entry.isIntersecting) return
              const el = entry.target as HTMLElement
              el.classList.add('is-in')
              io!.unobserve(el)
            })
          },
          { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
        )

    function collect() {
      const targets = Array.from(root!.querySelectorAll<HTMLElement>('[data-reveal]'))
      targets.forEach((el) => {
        if (seen.has(el)) return
        seen.add(el)

        // Stagger index is scoped per parent so sibling cards cascade.
        if (!el.style.getPropertyValue('--reveal-i')) {
          const siblings = el.parentElement
            ? Array.from(el.parentElement.children).filter((c) => c.hasAttribute('data-reveal'))
            : []
          const i = Math.max(0, siblings.indexOf(el))
          el.style.setProperty('--reveal-i', String(Math.min(i, 8)))
        }

        if (reduced) el.classList.add('is-in')
        else io!.observe(el)
      })
    }

    collect()
    const mo = new MutationObserver(collect)
    mo.observe(root, { childList: true, subtree: true })

    return () => {
      mo.disconnect()
      io?.disconnect()
    }
  }, [])

  return ref
}

/** Counts 0 → `to` once the element enters the viewport. */
export function useCountUp(to: number, duration = 1600) {
  const ref = useRef<HTMLSpanElement | null>(null)
  const [value, setValue] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (prefersReducedMotion()) {
      setValue(to)
      return
    }

    let raf = 0
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        io.disconnect()
        const start = performance.now()
        const tick = (now: number) => {
          const p = Math.min(1, (now - start) / duration)
          // easeOutExpo — fast settle, reads as "confident", not bouncy.
          const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p)
          setValue(Math.round(to * eased))
          if (p < 1) raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
      },
      { threshold: 0.4 },
    )

    io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [to, duration])

  return { ref, value }
}

/**
 * Cycles 0 → `length - 1` on an interval — the perpetual micro-loop behind the
 * hero panel's "live" slot and day selection. Freezes on the first index when
 * the user asked for reduced motion.
 */
export function useRotatingIndex(length: number, intervalMs = 2600) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (length <= 1 || prefersReducedMotion()) return
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % length)
    }, intervalMs)
    return () => window.clearInterval(id)
  }, [length, intervalMs])

  return index
}

/**
 * Pointer-driven parallax. Writes `--px` / `--py` (-1 → 1) on the container so
 * children can drift by different amounts with pure CSS.
 */
export function usePointerParallax<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || prefersReducedMotion()) return
    if (window.matchMedia('(pointer: coarse)').matches) return

    let raf = 0
    let px = 0
    let py = 0

    const apply = () => {
      raf = 0
      el.style.setProperty('--px', px.toFixed(3))
      el.style.setProperty('--py', py.toFixed(3))
    }

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      px = ((e.clientX - r.left) / r.width) * 2 - 1
      py = ((e.clientY - r.top) / r.height) * 2 - 1
      if (!raf) raf = requestAnimationFrame(apply)
    }

    const onLeave = () => {
      px = 0
      py = 0
      if (!raf) raf = requestAnimationFrame(apply)
    }

    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
      cancelAnimationFrame(raf)
    }
  }, [])

  return ref
}

/**
 * Cursor spotlight for card grids: writes `--mx` / `--my` in px on whichever
 * `[data-spotlight]` child the pointer is over. One listener for the whole grid.
 */
export function useSpotlight<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const root = ref.current
    if (!root || prefersReducedMotion()) return
    if (window.matchMedia('(pointer: coarse)').matches) return

    const onMove = (e: PointerEvent) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('[data-spotlight]')
      if (!card) return
      const r = card.getBoundingClientRect()
      card.style.setProperty('--mx', `${e.clientX - r.left}px`)
      card.style.setProperty('--my', `${e.clientY - r.top}px`)
    }

    root.addEventListener('pointermove', onMove)
    return () => root.removeEventListener('pointermove', onMove)
  }, [])

  return ref
}

/** Normalised page scroll progress (0 → 1) for the sticky progress rail. */
export function useScrollProgress() {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let raf = 0
    const update = () => {
      raf = 0
      const max = document.documentElement.scrollHeight - window.innerHeight
      setProgress(max > 0 ? Math.min(1, window.scrollY / max) : 0)
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [])

  return progress
}
