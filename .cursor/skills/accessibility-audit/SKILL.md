---
name: accessibility-audit
description: Reviews UI for WCAG contrast, semantic HTML, keyboard navigation, motion preferences, and forms; fixes issues found. Use for accessibility checks, a11y questions, or pre-ship review.
---

# Accessibility Audit: WCAG and Inclusive Design Review

Review for accessibility issues and fix them. **Good accessibility is good design.**

## Cursor notes

- Audit React/TSX components — check rendered semantics, not just JSX structure.
- Run all categories in **one pass** (no subagents required).
- For this project: mobile hit targets ≥ 44px, `focus-visible` on interactive elements.

## Phase 1: Identify surface

Files the user edited or asked about; otherwise most recently modified UI files. Note WCAG AA as default.

## Phase 2: Review all categories

Report every issue with severity. Work through all four:

### Contrast and color
- Normal text <18px: 4.5:1; large text: 3:1; UI components: 3:1
- No color-only state signaling
- Flag red+green, light gray on white
- Prefer toned whites/blacks over pure #FFF/#000

### Semantic HTML
- One `<h1>`, no skipped heading levels
- `<button>` not `<div onClick>`; `<label htmlFor>` linked to inputs
- `alt` on images; decorative = `alt=""`
- ARIA only when semantic HTML can't express the role

### Keyboard and focus
- Everything clickable is Tab-reachable
- Logical tab order; no `tabindex > 0`
- Modals: Escape closes; dropdowns keyboard-operable
- Visible `:focus-visible` rings — never `outline: none` without replacement

### Motion, forms, misc
- `prefers-reduced-motion` respected
- Specific error messages tied to fields (`aria-describedby`)
- `type="email"`, `autocomplete` where appropriate
- Hit targets ≥ 44×44px on touch

## Phase 3: Fix and summarize

Fix issues directly. For borderline contrast (4.4:1), fix anyway. Summarize: found/fixed by category, leftovers for user.
