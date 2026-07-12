---
name: make-a-prototype
description: Builds interactive clickable prototypes with real state, validation, and feedback. Use when the user asks for a prototype, mockup, demo, or wants something interactive/clickable.
---

# Make a Prototype: Interactive Clickable Prototype

Build a working interactive prototype — clickable, navigable, with real state and feedback. Static screenshots don't count.

## Cursor notes

- In this React project: use component state, React Router or conditional rendering for screen flow.
- Reuse existing components (`LiteBookRow`, theme helpers) when prototyping in-app flows.
- Persist meaningful state in `localStorage` where it helps iteration.

## Phase 1: Discovery

Confirm: **flow** (screens, entry, goal); **fidelity** (hi-fi or mid-fi); **device frame**; **variations**; **brand/design system**; **sample data** (no Lorem ipsum).

## Phase 2: Map screens and state

Document before building:

```
Screens: 1. Welcome → 2. Form → 3. Success
State: currentScreen, form fields, errors
```

## Phase 3: Build screen-by-screen

Real components, plausible content, one primary CTA per screen.

## Phase 4: Wire up interactions

- Navigation with state persistence
- Form validation with field-tied errors
- Loading states (even faked with `setTimeout`)
- Success/error feedback
- Immediate UI updates on state changes

## Phase 5: Sub-state and persistence

Selection, filters, modals (Escape closes, focus trap), form drafts in `localStorage`.

## Phase 6: Verify

Walk full flow: every CTA works, forms validate, keyboard nav (Tab, Enter, Escape), visible focus. Say what you couldn't verify.

## Phase 7: Variations

One file with toggles/tabs — not scattered v1/v2/v3 files. Use `make-tweakable` or in-prototype toggles.
