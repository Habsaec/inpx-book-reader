---
name: make-a-deck
description: Builds slide presentations as HTML with fixed 16:9 aspect ratio, keyboard navigation, and letterboxing. Use when the user asks for a deck, presentation, slides, or pitch.
---

# Make a Deck: Slide Presentation in HTML

Build a slide presentation as a single HTML file with fixed-size slides (1920×1080, 16:9) that letterbox to any viewport.

## Cursor notes

- Standalone HTML deliverable — not embedded in the React app unless requested.
- If no deck shell exists in the project, build a minimal shell with keyboard nav, slide counter, and CSS scale transform for letterboxing.

## Phase 1: Discovery

Confirm: **audience**; **slide count** (~1 slide per minute); **tone**; **source content**; **speaker notes** (only if requested); **brand** (invoke `frontend-aesthetic-direction` if none).

## Phase 2: Layout system

Commit to 4–6 layout types: cover, section header, content, quote, comparison, closing. Limit to 1–2 background colors.

## Phase 3: Deck shell

Each slide is a `<section>` with `data-screen-label`. Shell handles scaling, keyboard/tap nav, slide counter, `localStorage` persistence.

## Phase 4: Build slide-by-slide

- Body never under 24px on 1920×1080 canvas
- One primary message per slide
- Honest placeholders for imagery — no hand-drawn SVG filler
- No filler slides ("Why choose us?")
- Use design system tokens

## Phase 5: Speaker notes (if requested)

`<script type="application/json" id="speaker-notes">` array — full scripts, not bullet outlines.

## Phase 6: Verify

Scaling at multiple viewports, keyboard nav, no overflow, WCAG contrast. Invoke `accessibility-audit` for thoroughness.
