---
name: make-tweakable
description: Adds live tweak controls for colors, fonts, spacing, copy, and layout variants. Use when the user wants to play with options, compare visual choices, or adjust a design live.
---

# Make Tweakable: Add In-Design Tweak Controls

Add a floating control panel to adjust selected aspects live. **One file, many variants.**

## Cursor notes

- In React: use `useState` + CSS custom properties on `document.documentElement` or a wrapper.
- For this project: expose tweaks via a dev-only panel or Storybook-style controls if appropriate.
- Skip Claude Design host `postMessage` protocol — not applicable in Cursor.

## Phase 1: Identify tweakable aspects

3–8 controls max: color, typography, density, layout variant, component variants, copy, feature flags.

## Phase 2: Design the tweak panel

Floating panel (bottom-right), titled "Tweaks". Color picker, dropdowns, sliders, toggles, text inputs — compact stacked column.

## Phase 3: Wire live updates

```js
document.documentElement.style.setProperty('--tweak-primary', newColor);
```

For copy/layout: React state with re-render.

## Phase 4: Persist defaults

Store tweak defaults in `localStorage` or a `TWEAK_DEFAULTS` constant so values survive reload.

## Phase 5: Hide when off

Panel entirely hidden when toggled off — design must read as finished with panel closed.

## Phase 6: Verify

Toggle panel, change each tweak, reload and confirm persistence.
