---
name: frontend-aesthetic-direction
description: Establishes typography, color, density, and component style when no brand or design system exists. Use before greenfield hi-fi UI work when theme files and brand context are missing.
---

# Frontend Aesthetic Direction: Commit to a Look When No Brand Exists

Establish an aesthetic direction before hi-fi work in a greenfield context. Mocking hi-fi without committing to an aesthetic is the fastest path to AI-template output.

## Cursor notes

- For this project, check `src/lib/appTheme.ts` and CSS variables first — if they exist, **stop and use them**.
- Document direction in a comment block at the top of new theme/token files.

## Phase 1: Confirm there's truly no existing context

Double-check: no brand guide, no existing app to match, no reference site, no partial design system in the codebase. If any exist, **stop and use them**.

## Phase 2: Discover the intent

Confirm: **three adjectives** for the desired feel; **audience**; **industry**; **reference designs admired**; **off-limits** aesthetics.

If unsure, propose **4 distinct visual directions** (different palette families, not four cream variants) and let the user pick.

## Phase 3: Commit to the system

### Typography
Pick specific fonts — 1–2 families max. Avoid silent defaults: Inter, Roboto, Arial, Fraunces, Playfair-as-display.

### Color
Pick a tone: warm, cool, or neutral. Limit to 3–5 colors. Use `oklch()` for harmony when building from scratch. Tone whites/blacks (`#FAFAFA` / `#1A1A1A`).

**The warm-editorial look (cream + serif + terracotta) is the current default-model look** — choose only when the brief is genuinely editorial/hospitality.

### Density
4px or 8px spacing scale; tight / normal / loose.

### Radius and shadow
One system: sharp (0–2px), soft (4–8px), or pill. One elevation system.

### Component style
Filled, ghost, outlined, or elevated — pick a default.

## Phase 4: Document the direction

Write into the file as a comment block:

```
/* Aesthetic direction: [adjectives]
 * Type: [display] + [body]
 * Color: [tone]. bg/text hex. Brand: oklch(...)
 * Density: [tight|normal|loose]. 8px scale.
 * Radius: 4px. Components: ghost buttons; filled for primary CTA only.
 */
```

## Phase 5: Apply and validate

Build a small surface (hero, card, button group) and show early. Every subsequent design uses direction tokens, not new inline values.
