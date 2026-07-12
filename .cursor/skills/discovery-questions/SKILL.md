---
name: discovery-questions
description: Runs a structured kickoff question round at the start of new or ambiguous UI/design work. Use when starting a new screen, flow, redesign, or when output format, audience, fidelity, or brand context is unclear.
---

# Discovery Questions: Kickoff Question Protocol

Run a structured question round at the start of new or ambiguous design work. **Asking good questions is the single biggest lever for design quality** — bad designs come from missing context, not missing skill.

## Cursor notes

- Use the **AskQuestion** tool when available; otherwise one consolidated numbered list in chat.
- Read the codebase first (`appTheme.ts`, existing components) before asking what's already there.

## Phase 1: Read what's already attached

Before asking anything, read every attached resource — codebases, screenshots, brand guides, theme files, the stated brief. Asking "do you have a brand guide?" when they just attached one is the fastest way to lose the user's confidence.

## Phase 2: Decide whether to ask

**Ask when** the work is new or ambiguous; the output, audience, or fidelity is unclear; you don't know which design system or brand is in play; the variation count is unspecified.

**Skip when** the user gave you everything; it's a small tweak or follow-up; scope, audience, and constraints are explicit.

If the open question changes the design's direction (audience, format, brand, scope), ask. If it's a minor choice (a label, a default value), decide, build, and note the decision in your summary.

## Phase 3: Build the question set

Include these **always-ask** questions plus problem-specific ones (typically 3–6):

- **Starting point.** "Is there a UI kit, design system, codebase, or screenshots I should match?"
- **Variations.** How many? On what axes (visual, layout, interaction, copy)?
- **Novelty.** By-the-book, novel/creative, or a mix?
- **Focus axis.** Flows, copy, or visuals — where should exploration effort go?

Problem-specific: deck audience/slide count; landing page CTA and persona; prototype screens and device frame; brand adjectives and off-limits.

Size the round to ambiguity — never pad to hit a number.

## Phase 4: Format the question round

One consolidated round, not one question per turn. Prefer multiple choice; include "Decide for me" as an escape hatch. Order most-important-first.

## Phase 5: Confirm and execute

After answers: briefly recap choices that affect the design, note any pushback, then execute autonomously. Don't return with follow-up questions for minor decisions.

## Anti-patterns

- Don't skip asking on ambiguous new work.
- Don't ask what you can derive from the codebase.
- Don't ask to be safe — only ask when the answer changes what you build.
