# BookThread Interface Specification

## Intent

BookThread is a literary salon, not a social feed. Readers arrive after finishing the same book and move through discussions the way they would browse essays in a reading journal. Typography, spacing, and pacing must privilege interpretation over engagement mechanics.

## Layout

- Single editorial column
- Shell width: `min(100%, 52rem)`
- Outer page padding: `clamp(2.5rem, 6vw, 4rem) var(--page-gutter) var(--section-space)`
- Structure:

```
| whitespace | discussion column | whitespace |
```

Do not use split panes, sidebars full of widgets, or chat layouts.

## Book anchoring

Keep the book visibly present in both modes.

### List view anchor

- Small cover block with the book title set into it
- Book title and author near the thread list heading
- Supporting line explaining the room's purpose

### Thread view anchor

- Mini cover swatch
- Book title context line
- Author
- Optional chapter reference

## Thread list

Treat threads like essay entries in a literary journal.

Each entry includes:

- optional chapter reference
- author
- last activity
- thread title in serif
- preview text
- subtle response count
- optional subtle appreciation line

Styling rules:

- No heavy cards
- Use separators instead of boxed tiles
- Hover state should be a soft surface wash only

## Thread view

The opening post is the main essay on the page.

### Structure

- author and date metadata
- chapter reference
- prominent serif title
- long-form opening text
- subdued text actions: `Appreciate`, `Add response`, `Share link`

### Typography

- Title: `clamp(2rem, 5vw, 3rem)`
- Body: `1.04rem` serif
- Body line height: `1.9`
- Body max width: `42rem`

## Reply architecture

Replies are stacked written contributions, not bubbles.

Each reply contains:

- author
- subtle timestamp
- optional quiet appreciation label
- response text
- text-only actions

Nested replies:

- use a thin left rule
- indent softly with `1rem` per level
- cap deep indentation to avoid collapse on smaller screens

## Writing surface

The writing UI should resemble a notebook page.

### New thread form

- title field
- optional chapter anchor field
- large textarea for opening thought
- soft bordered surface with generous padding

### Reply form

- larger than a comment box
- short guidance copy above the textarea
- no chat composer styling

### Field styling

- Border radius: `1.15rem`
- Padding: `1rem 1.1rem`
- Background: quiet paper surface
- Textarea minimum height:
  - thread composer: `12rem`
  - reply composer: `8rem`

## Interaction rules

Allowed:

- subtle surface wash on hover
- soft expansion for nested replies
- restrained text-action emphasis

Forbidden:

- vote columns as primary structure
- chat bubbles
- emoji reactions
- loud count treatments
- glowing engagement states

## Contextual book references

Optional `chapterReference` values should appear in:

- thread list entry context
- thread view book anchor
- opening post metadata when available

Fallback label when absent: `Whole book`

## Implementation reference

Implemented in:

- `src/pages/BookThread.jsx`
- `src/pages/BookThread.css`
- `server/models/Thread.js`
- `server/controllers/threadController.js`
