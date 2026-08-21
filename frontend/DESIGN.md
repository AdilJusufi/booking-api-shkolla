# Design System: Rezervo Mjekun — Appointment Booking

> Source of truth for **the entire product**: the public marketing surface, the
> patient app, the doctor portal and the admin panel. Tokens live in `:root` in
> `src/styles/index.css`; the landing page keeps a `.lp`-scoped token set for its
> editorial treatments, and the admin shell keeps an always-dark scoped override.
> Both derive from the same palette below — no surface invents its own colours.

## 1. Visual Theme & Atmosphere

Clinical calm with editorial confidence. The interface should feel like the waiting
room of a very good private clinic — bright, uncluttered, quietly expensive — not
like a hospital form and not like a startup landing page. Every screen reads as
*capable of being trusted with your health data*.

- **Density: 4** — Daily App Balanced. Generous whitespace, but information-dense
  where it counts (time slots, availability, dates). Never decorative emptiness.
- **Variance: 8** — Offset Asymmetric. No centered heroes, no mirrored columns.
  Weight sits left; supporting evidence sits right, at a different rhythm.
- **Motion: 6** — Fluid, spring-driven. Motion explains state and continuity;
  it never performs. A booking product earns trust by feeling *responsive*, not
  cinematic.

The emotional target: **"this will take thirty seconds and it will work."**

## 2. Color Palette & Roles

Single accent. Cool-neutral base held constant — no warm/cool drift, on any surface.

- **Fog Canvas** (`#f7f8f8`) — Primary page background surface
- **Pure Surface** (`#ffffff`) — Card, panel and container fill
- **Sunk Surface** (`#fbfbfb`) — Input and control wells inside a card
- **Charcoal Ink** (`#131718`) — Primary text; also **the** dark band canvas —
  detail heroes, search hero, split-auth brand panel, patient sidebar, footer,
  toasts. Never `#000000`
- **Body Ink** (`#3a4241`) — Running prose
- **Muted Steel** (`#6b7472`) — Secondary text, metadata, field labels
- **Whisper Border** (`rgba(19,23,24,.10)`) — 1px structural lines, card borders
- **Hairline Ghost** (`rgba(19,23,24,.06)`) — Internal dividers, skeleton fill
- **Clinical Teal** (`#0f6e62`) — **The single accent.** CTAs, active slots, focus
  rings, availability indicators. Saturation 76%, deliberately under 80%
- **Teal Wash** (`#e6f0ee`) — Accent surface tint for tags, hovers, avatars,
  selected states
- **Teal Deep** (`#0a4e45`) — Accent text on wash, pressed states

Functional status hues are **not** brand accents and are used only to report state:
**Ok** `#14795a`, **Warn** `#8a6212`, **Danger** `#a83226`, each with a matching
`-bg` wash. Pending/verification states use Warn; star ratings use Warn.

Dark theme remaps canvas to `#111415`, surface to `#1d2021`, ink to `#e6e9e9`, and
lifts the accent to **Lifted Teal** (`#34b3a2`) for AA contrast. The admin shell
uses the same dark values pinned on regardless of theme.

**Rule:** anything painted on a *fixed* surface (a white chip on a dark band, a
`btn--light`) must use a *fixed* ink value, never the theme-dependent `--ink` —
otherwise it inverts to white-on-white in dark mode.

**Banned:** purple/violet accents, any blue (`#2563eb` and friends), neon or
outer-glow shadows, colour-tinted drop shadows, gradient-filled headline text,
oversaturated fills, pure black, dual accents (the former gold secondary is gone
from the entire codebase).

## 3. Typography Rules

- **Display: `Outfit`** — All headings, buttons, tabs, brand marks, avatar
  initials. Weights 600–700, tracking tight (`-.035em`, `-.045em` at `h1`),
  line-height `1.12`. Hierarchy comes from weight and colour, not ever-larger
  type. Weight 800 is banned — it reads as shouting
- **Body: `Plus Jakarta Sans`** — Relaxed leading (1.6), max measure **65ch**,
  set in Muted Steel for secondary passages
- **Mono: `JetBrains Mono`** — **All** temporal and numeric data, everywhere in
  the product: time slots, dates, day numbers, counters, durations, prices,
  reference codes, result counts, pagination, ratings, timeline stamps, the 404
  code. Tabular figures always (`font-variant-numeric: tabular-nums`). This is
  what makes a scheduling product read as precise
- **Field labels** — Uppercase, `.69rem`, tracked `.08em`, Muted Steel, above the
  control. Never a floating label
- **Banned:** `Inter`, generic system-UI stacks for display, all generic serifs
  (`Times New Roman`, `Georgia`, `Garamond`). Serif is banned outright in the
  authenticated app

## 4. Component Stylings

- **Buttons** — Accent fill for primary, hairline ghost for secondary. Radius
  `12px`. Minimum height **44px**. Tactile: `translateY(-1px)` on hover,
  `translateY(0) scale(.985)` on active. No outer glow, no custom cursors
- **Radii scale** — `8px` tags/chips, `12px` buttons/inputs/slots, `20px` cards and
  list rows, `28px` panels, pill reserved for genuine switches only
- **Cards** — Diffused shadow tinted to the canvas hue, never a neutral black drop.
  `translateY(-3px)` on hover. Used only where elevation communicates hierarchy
- **Doctor / clinic cards** — Left-aligned and editorial. A centred column of
  avatars reads as a template; the avatar fills with the accent on hover and the
  CTA arrow advances 3px
- **Booking panel** — The proof object. One surface: practitioner row → date strip
  → slot grid → confirm action → footer. Sections separated by hairlines, not by
  stacked floating cards
- **Slots** — Mono, tabular, 44px min height. Available = hairline outline;
  selected = solid accent; taken = struck through at 40% opacity
- **Inputs** — Label above (uppercase, tracked), control below, error underneath.
  Focus ring in Clinical Teal at 2px. Sunk-surface well that lifts to pure white
  on focus
- **Tags/chips** — Teal Wash fill, Teal Deep text, `8px` radius, 700 weight
- **Loaders** — **Skeletal only.** `Skeleton`, `SkeletonRows` and `SkeletonDetail`
  in `components/ui.tsx` mirror the final layout so nothing reflows when data
  lands. Circular spinners are banned; inline "working on it" uses `Pending`
  (three dots on a staggered pulse)
- **Empty States** — Composed: a washed icon tile, a title, one line of guidance,
  and an optional concrete next action. Never a bare "No data"
- **Error States** — Inline `ErrorBox` in the Danger wash with a token-derived
  border, reported where the failure happened

## 5. Layout Principles

- **No overlapping elements.** Every element owns a clean spatial zone. No
  absolute-positioned content stacking
- **No centered hero.** The landing hero is an asymmetric `1.05fr / .95fr` split;
  the search hero is left-aligned on a Charcoal Ink band with a hairline grid
- **The 3-equal-card row is banned.** Replacements in use:
  - *How it works* → asymmetric sticky-left / stepped-right sequence
  - *Doctors* → horizontal snap-scroll rail
  - *Clinics* → asymmetric grid, one feature tile spanning two rows
  - *Specialties* → gapless bordered bento, 4 columns
  - *Result grids* → `auto-fill / minmax(280px, 1fr)`, never a hard `repeat(3)`
- CSS Grid over flexbox percentage math. No `calc()` percentage hacks
- Container max-width `1140px`, centered, `20px` gutters
- Full-height regions use `100dvh` — never `100vh` (iOS Safari jump)
- Section rhythm: `clamp(4.5rem, 9vw, 7.5rem)` vertical padding
- **Responsive:** every multi-column layout collapses to one column below 768px.
  No horizontal overflow, ever. All interactive elements clear a 44px tap target

## 6. Motion & Interaction

- **Spring physics default** — `cubic-bezier(.22,1,.36,1)` (`--ease-spring`), the
  standard-issue approximation of stiffness 100 / damping 20. Linear easing banned
- **Durations** — `--dur-fast .16s`, `--dur .28s`, `--dur-slow .5s`. Nothing
  hand-rolls a `150ms ease`
- **Staggered orchestration** — Nothing mounts as a block. `useReveal` observes
  `[data-reveal]` children inside a `[data-reveal-root]` container and cascades
  them at `60ms` per sibling. The root attribute is required: a `data-reveal`
  element outside one would be stranded at opacity 0
- **Route entry** — Authenticated content settles in with an 8px rise rather than
  snapping
- **Perpetual micro-interactions** — Availability dot pulses, the partner marquee
  drifts, the active booking step dot breathes, the doctor timeline "now" marker
  pulses, the first timeline event breathes, skeletons sweep. Every one is
  infinite and low-amplitude
- **Performance** — `transform` and `opacity` only. Never animate `top`/`left`/
  `width`/`height`. Grain and grid overlays live on fixed pseudo-elements
- **Respect `prefers-reduced-motion`** — all loops, translations and route
  transitions drop; final states apply immediately, meaning is preserved

## 7. Anti-Patterns (Banned)

- No emojis anywhere in the UI
- No literal `←` `→` `↑` glyphs in copy — use the Lucide icon set
- No `Inter`; no generic serifs; no `font-weight: 800`
- No pure black `#000000`; no neutral-black shadows
- No neon, glow, or colour-tinted outer shadows
- No gradient text on headlines
- No oversaturated, dual, or off-palette accents (no blue)
- No custom mouse cursors
- No circular loading spinners
- No overlapping / stacked absolute-positioned content
- No 3-column equal-card feature rows
- No `100vh`; no pill radius except on real switches
- No filler UI text: "Scroll to explore", "Swipe down", bouncing chevrons,
  scroll-down arrows
- No generic placeholder names ("John Doe", "Acme", "Nexus")
- No fake round metrics (`99.99%`, `50%`)
- No AI copywriting clichés ("Elevate", "Seamless", "Unleash", "Next-Gen")
- No broken image hosts — seeded `picsum.photos` or inline SVG only
- No centered hero layouts
