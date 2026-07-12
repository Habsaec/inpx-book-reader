---
name: ai-slop-check
description: Detects and fixes generic AI aesthetics—gradients, emoji decoration, default SaaS cards, overused fonts, editorial-warm house style. Use when UI looks generic, template-like, or user asks to remove AI slop.
---

# AI Slop Check: Detect and Fix Generic AI Aesthetics

Review for visual tropes that signal "AI-generated template" and fix them.

## Cursor notes

- Read `appTheme.ts`, component files, and CSS variables to resolve actual values.
- Single-pass review — patterns are obvious enough without subagents.

## Phase 1: Identify surface

Files user edited or modified this session. Read referenced styles and tokens.

## Phase 2: Apply each rule

Report every detection with confidence/severity.

### 1. Gradients
**Default:** flat color or subtle two-stop same-hue gradient.
**Detect:** rainbow/3+ color gradients, purple-pink hero blends.

### 2. Emoji
**Default:** none unless brand uses them functionally.
**Detect:** 🚀 on buttons/headlines, emoji bullets.

### 3. Cards
**Default:** shadow, thin border, or background contrast.
**Detect:** `border-radius: 12px` + `border-left: 4px solid` as default card.

### 4. Imagery
**Default:** real photos, pro illustration, honest placeholders.
**Detect:** hand-drawn SVG people/scenes, AI character art.

### 5. Type
**Default:** fonts chosen with intent.
**Detect:** Inter, Roboto, Arial, Fraunces as silent defaults.

### 6. Color
**Default:** toned whites/blacks (`#FAFAFA` / `#1A1A1A`).
**Detect:** pure `#FFFFFF` on `#000000`.

### 7. Token discipline
**Detect:** inline hex not tracing to tokens — five slightly different blues.

### 8. Spacing
**Default:** 4px or 8px scale.
**Detect:** `padding: 7px`, `gap: 13px`, `margin: 18px`.

### 9. Editorial-warm house style
**Detect without brand reason:** cream `#F4F1EA` bg + serif display + terracotta/amber — especially on dashboards/tools.

## Phase 3: Fix and summarize

Apply fixes. Note judgment calls user can override. Summarize tropes found and fixes applied.
