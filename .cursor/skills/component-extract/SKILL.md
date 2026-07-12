---
name: component-extract
description: Inventories reusable components from a design or codebase with variants and states. Use when building a component library, handing off structured UI, or identifying patterns in existing screens.
---

# Component Extract: Identify Reusable Components

Walk a design and identify reusable components; emit an inventory for a component library.

## Cursor notes

- Scan `src/components/` for existing shared components before inventing new ones.
- For this project: `LiteBookRow`, `ReadProgressBar`, `AuthorPortrait`, `BookCover`, theme helpers.

## Phase 1: Identify the surface

Single file, multi-page flow, or whole project. Build mental model of visual vocabulary.

## Phase 2: Walk and inventory

For each element: appears more than once? Could appear elsewhere? Has variants? Has states?

Categories:
- **Foundational** — tokens
- **Atoms** — button, input, badge, avatar, icon, link
- **Molecules** — form field, card, toast, modal, dropdown
- **Organisms** — header, footer, sidebar, table, hero
- **Templates** — landing, list, detail, empty state

## Phase 3: Per component document

Name, purpose, variants, sizes, states, tokens used, composition, a11y notes, do/don't.

## Phase 4: Identify gaps

Inconsistencies (three button styles → one canonical), missing states, missing variants, off-scale values.

## Phase 5: Emit and hand off

Write `component-inventory.md` or update project docs. Suggest: `design-system-extract`, `polish-pass`, or building real code.
