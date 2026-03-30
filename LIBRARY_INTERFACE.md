# Library Interface Specification

## Intent

The library should feel like a personal reading room, not a marketplace. Books must remain the visual center of gravity at all times. The page should support browsing, returning to in-progress books, and rediscovering finished reads without product-card noise.

## Chosen structure

Hybrid reading library:

1. Continue Reading
2. Recently Read
3. Recently Opened
4. Your Library

This favors reading continuity first, then the full shelf below.

## Layout

- Page width: `min(100%, var(--page-max-width))`
- Main rhythm: large top editorial heading plus stacked sections
- Shelf sections use horizontal scrolling rows
- Full collection uses a quiet cover grid

Structure:

```
| whitespace | content column with shelves and grid | whitespace |
```

## Search and discovery

- One understated search field
- One row of minimal category chips
- No advanced filter panel
- Search field width: `min(100%, 30rem)`
- Chip height: `2.1rem`

## Book hierarchy

Every entry must prioritize:

1. Cover
2. Title
3. Author

Secondary only:

- progress
- reading time
- category

Do not place synopsis or feature-heavy metadata directly on the book tile.

## Cover treatment

Primary path:

- support real cover art through `coverImage`

Fallback path when no cover asset exists:

- use a quiet typographic jacket treatment
- include spine line, title, author, and subtle pattern
- avoid flat color rectangles with no book structure

## Book entry metrics

- Cover ratio: `2 / 3`
- Grid column min width: `10.5rem`
- Shelf card width: `9.75rem` to `12rem`
- Hover: slight lift and soft shadow only

## Progress

Progress must remain visually quiet:

- thin line under cover
- optional short label such as `Continue from page 4`
- finished state can read simply `Finished`

## Section tone

Use typography and whitespace for sectioning instead of card containers.

Section examples:

- Continue Reading: books with saved in-progress session state
- Recently Read: books completed by the user
- Recently Opened: books touched recently, excluding current in-progress shelf
- Your Library: full collection

## Interaction rules

Allowed:

- gentle lift on hover
- soft shadow change
- subtle transition under `200ms`

Forbidden:

- glow
- dramatic scale
- dashboard cards
- oversized CTA buttons

## Data support

Current implementation adds:

- optional `coverImage` on `Book`
- local reading-session tracking for progress and recent opens

Implementation files:

- `src/pages/BooksLibrary.jsx`
- `src/pages/BooksLibrary.css`
- `src/utils/readingSession.js`
- `server/models/Book.js`
