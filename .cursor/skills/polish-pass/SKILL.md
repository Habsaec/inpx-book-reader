---
name: polish-pass
description: Final quality gate combining accessibility, AI slop, hierarchy/rhythm, and interaction state reviews before shipping UI. Use before delivery, before PR, or when user asks to polish or ship.
---

# Polish Pass: End-of-Design Quality Gate

Comprehensive quality check before stakeholders or ship. Umbrella for four review skills.

## Cursor notes

- Run all four reviews **sequentially in one session** (no subagents required).
- Read skill files if needed: `accessibility-audit`, `ai-slop-check`, `hierarchy-rhythm-review`, `interaction-states-pass`.
- Skip if design is mid-flight (broken layout, iterating structure) — ask user first.

## Phase 1: Confirm scope

Files to polish; medium (mobile app / page); context (internal / customer-facing). If mid-flight, ask whether to polish now.

## Phase 2: Run four reviews

Report every issue with severity — don't self-censor minor findings.

1. **Accessibility** — contrast, semantic HTML, keyboard, focus, motion, forms, hit targets
2. **AI slop** — gradients, emoji, default cards, fonts, editorial-warm default, off-scale spacing
3. **Hierarchy & rhythm** — primary/secondary/tertiary, spacing scale, 5-second test
4. **Interaction states** — hover/active/disabled/focus/loading, transitions, feedback

## Phase 3: Aggregate and prioritize

Merge duplicates. Group into:
1. **Blockers** — WCAG failures, missing keyboard/focus/labels — fix all
2. **Quality** — slop, hierarchy, missing states — fix all
3. **Polish** — subtler improvements — apply or flag

## Phase 4: Fix and re-verify

Fix blockers and quality issues. Re-check: contrast fixes didn't wash out brand; focus rings don't overlap; primary CTA still feels primary.

## Phase 5: Final summary

- **Verdict:** Ready to ship / needs user review / needs more iteration
- **Fixed** — counts by category
- **Open decisions** — font, color, emphasis choices
- **Out of scope** — copy edits, new features
