# After The Last Page Design System

## Core principle

After The Last Page is a reading instrument. The interface should feel closer to a printed page than to a dashboard. Text has priority. Community tools, discovery, and commerce sit in supporting roles.

## Theme tokens

Use `html[data-theme="light"]`, `html[data-theme="sepia"]`, and `html[data-theme="dark"]`.

### Light

- `--page-bg: #f6f3ed`
- `--page-bg-alt: #efe9de`
- `--surface-1: #fbf8f2`
- `--surface-2: #f1ebdf`
- `--text-primary: #1c1c1c`
- `--text-secondary: #5b544c`
- `--text-muted: #857c72`
- `--accent-ink: #3f4964`
- `--accent-soft: #e8ebf4`
- `--accent-soft-strong: #dde3f0`
- `--accent-warm: #8b6e38`

### Sepia

- `--page-bg: #efe3c2`
- `--page-bg-alt: #e5d5af`
- `--surface-1: #f4ebd1`
- `--surface-2: #eadbb8`
- `--text-primary: #2a1e12`
- `--text-secondary: #5c4731`
- `--text-muted: #8a7359`
- `--accent-ink: #46506b`
- `--accent-soft: #dfe3ed`
- `--accent-soft-strong: #d2d8e5`
- `--accent-warm: #8a6b34`

### Dark

- `--page-bg: #111111`
- `--page-bg-alt: #191816`
- `--surface-1: #191816`
- `--surface-2: #22201d`
- `--text-primary: #e5e5e5`
- `--text-secondary: #bab2a7`
- `--text-muted: #90887e`
- `--accent-ink: #d7def4`
- `--accent-soft: #283043`
- `--accent-soft-strong: #303952`
- `--accent-warm: #af9462`

## Typography

### Reading typography

- Font family: `Literata`
- Use for: book content, page titles, thread titles, long-form headings
- Reading measure: `72ch` max, ideal range `60-75ch`
- Reading line height: `1.72`
- Reading base size: `clamp(1.08rem, 1rem + 0.35vw, 1.22rem)`
- Paragraph rhythm: `margin-bottom: 1.4em`
- Paragraph indent: `1.8em`, except the first paragraph after a heading

### Interface typography

- Font family: `IBM Plex Sans`
- Use for: navigation, labels, metadata, controls
- UI line height: `1.5`

### Type scale

- `--font-size-0: 0.8125rem`
- `--font-size-1: 0.9375rem`
- `--font-size-2: 1rem`
- `--font-size-3: 1.125rem`
- `--font-size-4: 1.25rem`
- `--font-size-5: 1.5rem`
- `--font-size-6: 1.875rem`
- `--font-size-7: 2.375rem`
- `--font-size-8: 3.125rem`

## Spacing and layout

- Page gutter: `clamp(1rem, 3vw, 2rem)`
- Section spacing: `clamp(3rem, 8vw, 6rem)`
- Reading column max width: `46rem`
- Full app max width: `84rem`
- Sticky chrome height: `4.5rem`

Spacing scale:

- `--space-1: 0.25rem`
- `--space-2: 0.5rem`
- `--space-3: 0.75rem`
- `--space-4: 1rem`
- `--space-5: 1.5rem`
- `--space-6: 2rem`
- `--space-7: 3rem`
- `--space-8: 4.5rem`
- `--space-9: 6rem`

Layout rules:

- Keep primary reading and discussion content centered.
- Prefer one dominant column with optional secondary notes on wide screens.
- Avoid dashboard grids. Use lists, split editorial layouts, or quiet two-column shelves only when necessary.
- Leave margin around text so the interface never crowds the reading measure.

## Surfaces and borders

- Primary panel background: `var(--surface-1)`
- Quiet sub-surface: `var(--surface-muted)`
- Border: `1px solid var(--border-soft)`
- Panel radius: `1.5rem`
- Control radius: `999px`
- Shadow: `0 12px 30px rgba(51, 39, 20, 0.05)` in light themes, softer in dark

Rules:

- No glow.
- No saturated fills.
- No deep stacked shadows.
- No hard card outlines around every element.

## Controls

### Primary button

- Height: `2.75rem`
- Padding: `0 1rem`
- Border radius: `999px`
- Background: `var(--accent-soft)`
- Text: `var(--accent-ink)`
- Border: `1px solid var(--accent-border)`

### Secondary button

- Height: `2.75rem`
- Background: `transparent`
- Border: `1px solid var(--border-soft)`
- Hover: `background: var(--surface-muted)`

### Inputs

- Padding: `0.9rem 1rem`
- Border radius: `1rem`
- Border: `1px solid var(--border-soft)`
- Background: `transparent` or `var(--surface-1)` depending on context

## Navigation

- Use a single sticky top bar.
- Keep it narrow and typographic.
- Use a subtle background wash: `var(--nav-bg)`
- Use only a bottom border for structure.
- Avoid large icon treatment or floating glass containers.

## Interaction rules

Allowed:

- `180ms` to `280ms` transitions
- gentle fade-in
- border and background shifts
- soft opacity changes

Forbidden:

- glow
- bounce
- heavy scale animations
- pulsing neon
- flashy hover color jumps

## Component behavior

- Book discovery cards should feel like quiet shelf entries, not product tiles.
- Thread and discussion views should resemble annotated pages.
- Verification, chat, and access flows should inherit the same paper-and-ink palette.
- Commerce views should look like a study desk or print workshop, not a storefront dashboard.

## Implementation reference

The live tokens and component baselines are implemented in:

- `src/index.css`
- `src/components/layout/Navbar.css`
- `src/pages/*.css`
