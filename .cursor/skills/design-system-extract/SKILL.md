---
name: design-system-extract
description: Extracts design tokens (color, typography, spacing, radii, shadow) from codebase, brand guide, or screenshots into a structured tokens file. Use when matching existing visual language or creating tokens from appTheme/CSS.
---

# Design System Extract: Pull Tokens from Sources

Extract design tokens and emit a structured tokens file. Once tokens exist, future designs reference them.

## Cursor notes

- For this project start with: `src/lib/appTheme.ts`, `src/index.css` (CSS variables), Tailwind config if present.
- Emit as `tokens.css`, extend `appTheme.ts`, or document in `tokens.md` — match project conventions.

## Phase 1: Identify sources

Codebase theme files, live site, screenshots, brand guide. If unspecified, ask — invented tokens defeat the point.

## Phase 2: Extract by category

Capture concrete values — never guess.

### Colors
Brand primary/accent, semantic (success/warning/error), neutral scale, surfaces (bg, card, border). Flag inconsistencies.

### Typography
Families, sizes actually in use, weights loaded, line heights, named text styles.

### Spacing
Actual scale (4px or 8px base). Separate inset/inline/block if defined.

### Radii and shadows
3–5 radius values, elevation scale with full CSS.

### Other
Z-index, animation durations, breakpoints, container widths.

## Phase 3: Emit tokens file

```css
:root {
  --color-primary: #...;
  --font-sans: "...", system-ui, sans-serif;
  --space-1: 4px;
  --radius-md: 8px;
}
```

Or match source format (`appTheme.ts` typed exports).

## Phase 4: Document findings

Summarize: sources used, gaps (undefined token sets), inconsistencies, recommended next steps.
