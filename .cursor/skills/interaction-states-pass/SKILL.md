---
name: interaction-states-pass
description: Verifies hover, active, disabled, focus-visible, and loading states on all interactive elements. Use before shipping interactive UI or when buttons feel broken/unresponsive.
---

# Interaction States Pass

Verify every interactive element has complete states and transitions.

## Cursor notes

- Check Tailwind classes: `hover:`, `active:`, `disabled:`, `focus-visible:`
- React: `disabled` prop, `aria-busy` for loading, `cursor-not-allowed`
- For this project: `active:scale-[0.99]` patterns on cards/buttons

## Phase 1: Inventory

List every interactive element: buttons, links, inputs, toggles, clickable rows, tabs, modals.

## Phase 2: Per-element verification

1. **Default** — clearly interactive at rest
2. **Hover** — color/shadow/transform change (not opacity-down — reads disabled)
3. **Active** — scale(0.98) or darker color
4. **Disabled** — opacity ~0.6, `cursor-not-allowed`, no hover
5. **Focus** — `:focus-visible` ring, 2px, 3:1 contrast
6. **Loading** — spinner/label swap, prevent double-submit

## Phase 3: Transitions

`transition: background 0.2s ease, transform 0.2s ease` — 0.15–0.3s for states. Wrap in `prefers-reduced-motion`.

## Phase 4: Action feedback

Success/error visible. Active tab/page/selection visually distinct. No silent failures.

## Phase 5: Fix and summarize

Add missing states using design tokens. Default fallbacks: hover 10–15% darker; focus `outline: 2px solid var(--color-primary); outline-offset: 2px`.

Summarize: elements checked, states added, judgment calls.
