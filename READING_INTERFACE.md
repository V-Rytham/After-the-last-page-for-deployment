# Reading Interface Specification

## Intent

The reader is not a web page. It is a digital book surface for 20-90 minute sessions. Text must remain the visual center of gravity. Chrome appears only when requested and fades again as soon as the reader returns to the page.

## Layout

- Primary device: landscape tablet
- Content frame width: `min(100%, 56rem)`
- Reading column width: `min(100%, 46rem)`
- Reading measure: `60-75ch`
- Wrapper padding: `max(5.75rem, 12vh)` top and `max(4.5rem, 10vh)` bottom
- Outer structure:

```
| touch zone | whitespace | reading column | whitespace | touch zone |
```

## Reading surface

Use a centered page frame rather than full-bleed text.

### Light

- Background: `#f6f3ed`
- Body text: `#1c1c1c`
- Secondary text: `#5b544c`

### Sepia

- Background: `#efe3c2`
- Body text: `#2a1e12`
- Secondary text: `#5c4731`

### Dark

- Background: `#171614`
- Body text: `#e5e5e5`
- Secondary text: `#bab2a7`

Rules:

- Never use pure white or pure black.
- Keep contrast warm and stable.
- Use only a soft page wash, never a loud gradient.

## Typography

- Reading face: `Literata`
- Interface face: `IBM Plex Sans`
- Base reading size: `1.12rem`
- Allowed size range: `0.96rem` to `1.35rem`
- Default line height: `1.74`
- Line-height presets:
  - Compact: `1.66`
  - Book: `1.74`
  - Open: `1.8`
- Paragraph indent: `1.8em`
- Paragraph spacing: `1.45em`
- Chapter kicker:
  - Size: `0.72rem`
  - Tracking: `0.16em`
  - Transform: uppercase
- Chapter title:
  - Size: `clamp(2rem, 4vw, 2.9rem)`
  - Line height: `1.08`

## Floating toolbar

Toolbar behavior:

- Hidden by default after a short delay
- Reappears when the reader taps the page center
- Hides again on scroll
- Remains visible while settings are open

Toolbar metrics:

- Width: `min(46rem, calc(100vw - 2rem))`
- Position: `top: 1rem`
- Radius: `1.25rem`
- Backdrop: `blur(16px)`

Toolbar contents:

- Back to library
- Previous and next chapter controls
- Theme cycle control
- Quick text-size stepper
- Settings trigger

## Progress indicator

Use a bottom floating rail, not a footer bar.

- Width: `min(46rem, calc(100vw - 2rem))`
- Position: `bottom: 1rem`
- Height of line: `2px`
- Default opacity: `0.58`
- Revealed opacity: `0.92`
- Metadata:
  - `Page x / y`
  - percentage complete

## Settings panel

The settings panel should feel like a soft reading sheet, not an admin modal.

- Width: `min(23rem, calc(100vw - 2rem))`
- Radius: `1.5rem`
- Backdrop: low-opacity blur
- Controls:
  - theme selection
  - text size adjustment
  - line spacing selection

## Touch interaction model

- Left edge zone: previous page
- Center zone: toggle chrome
- Right edge zone: next page

Each side zone should be wide enough for thumb input:

- Width: `16vw`
- Minimum width: `4.5rem`

## Motion

Allowed:

- fade in/out
- short position easing
- gentle blur-backed reveals

Forbidden:

- bounce
- glow
- aggressive scale
- loud progress animation

## Implementation reference

This spec is implemented in:

- `src/pages/ReadingRoom.jsx`
- `src/pages/ReadingRoom.css`
