# Mobile Redesign — TrucoBench Web UI

**Date:** 2026-04-04  
**Status:** Design approved, pending implementation  
**Scope:** Full mobile experience (lobby, gameplay, transitions) — 360px floor, 390px+ optimized

---

## Understanding Summary

- **What:** Mobile-first redesign of TrucoBench web UI, adapting the desktop newspaper aesthetic for phone screens
- **Why:** Current mobile layout is cramped, has UX bugs (mode persists, broken collapse), and doesn't match the design inspiration
- **Who:** Casual users playing Truco against AI on phones
- **Constraints:** No new routes/pages (single-screen stays), no API/engine changes, desktop layout unchanged
- **Non-goals:** Desktop redesign, new features, game mechanic changes

## Assumptions

- Dark mode adaptations follow automatically from existing CSS variables
- No forced orientation — portrait primary, landscape acceptable via natural reflow
- No new dependencies required

---

## Design Specification

### 1. Lobby Header & i18n

**i18n:** Replace 3 separate buttons (EN/PT/ES) with a `<select>` dropdown styled as a torn-paper chip. Shows current locale code + small caret.

**Header layout on mobile:**
```
[TrucoBench title        ] [sound] [theme] [PT ▾]
```
- Title takes available space, left-aligned, larger than current
- GitHub icon moves to footer
- Three icon-sized buttons on the right (44px touch targets each)

**Subtitle:**
- Before mode selection: "Truco Paulista com IA"
- After mode selection: subtitle disappears, replaced by compact mode chips

---

### 2. Game Mode Tabs

**Before selection (no seats filled):**
- Three torn-paper buttons displayed prominently, centered below subtitle
- Main call-to-action — clear that you pick one to start

**After selection:**
- Collapse into horizontal row of torn-paper chips above the table
- Active mode: full opacity, accent background, slightly larger
- Inactive modes: dimmed, smaller text, muted background
- Tapping inactive chip resets all seats and applies new template

**State logic:**
- New state: `activeTemplate: "1v1" | "1v3" | "4ai" | null`
- Switching template: clear all seats → fill with new template
- If user manually removes all seats: `activeTemplate` resets to `null`, big buttons return

**Sizing:**
- Big buttons (pre-selection): ~full width, ~44px tall each
- Chips (post-selection): ~100px wide each, ~32px tall, horizontal row with gap-2

---

### 3. Lobby Table & Seats

**Table:**
- Keep `aspect-[4/3]`, remove max-width constraint on mobile for more horizontal space
- Reduce internal padding
- Reduce center watermark size on mobile

**Seats:**
- Remove `scale-[0.85]` hack — use proper responsive sizing instead
- Empty seat: `+` icon (44x44px), clean dashed border
- Filled seat: model icon + truncated name, single line
- Remove "x" close button from seat surface — tapping filled seat opens SeatPicker with "Remove" option at top
- Add subtle compass labels (N/S/E/W) near each seat
- Tighten negative offsets on mobile: `-top-10 sm:-top-14` instead of fixed large values

---

### 4. Settings & Deal Button

**Settings — hidden by default:**
- Replace visible pills row with single "Advanced" torn-paper chip (gear icon)
- Tapping expands compact panel: provider mode, timeout, prompt mode, temperature
- Panel closes on tap outside or "Done" button

**New defaults:**
- `turnTimeout`: 60s → **30s**
- `promptMode`: "standard" → **"economy"**

**Deal button:** Stays full-width, prominent, torn-paper accent style. No changes.

**Help section:**
- Collapse to single link-style line: "O que é Truco Paulista?" with ▾ caret
- Expands inline on tap
- Positioned below deal button, lower visual priority

---

### 5. Gameplay — Header & Score Bar

**Replace full lobby header with compact gameplay bar (~48-56px):**
```
[←] [Claude S. + Gemini]  0 — 0  [GPT-4o + DeepSeek] [⚙]
     Team A               R1      Team B
```
- **←:** Back to lobby (confirmation dialog if game active)
- **⚙:** Overlay with sound/theme/language + "Novo jogo"
- **Score:** Large centered numbers, round indicator below
- **Team names:** Abbreviated if >12 chars ("Claude Sonnet 4.6" → "Claude S.")

4-player: stack two names per side, smaller font  
2-player: one name per side, slightly larger font

---

### 6. Gameplay — Table & Cards

**Table area:**
- Remove padding/margins between score bar and table
- Full bleed width on mobile
- Clean background (no newspaper texture)
- Relaxed aspect ratio — grow taller if needed

**Card sizing:**
- Table cards (tricks): `clamp(42px, 10vw, 52px)` width
- Card backs (opponents): `clamp(28px, 7vw, 36px)`
- Hand cards (your cards): `clamp(56px, 14vw, 72px)` — largest

**4-player layout simplification:**
- North/East/West: card count indicator (`card-back icon + number`) instead of individual card-back spread
- Saves ~80px horizontal per position
- Center: trick cards only

**Vira card:** Move to top-left corner of table with small "Vira" label.

---

### 7. Gameplay — Hand, Actions & Log

**Hand area — fixed to bottom of viewport:**
```
┌─────────────────────────────┐
│  [Card 1]  [Card 2]  [Card 3]  │  ← large tap targets
├─────────────────────────────┤
│  [TRUCO]  [ACCEPT]  [FOLD]     │  ← contextual, only when relevant
└─────────────────────────────┘
```
- Fixed above safe area inset
- Cards centered, spaced evenly
- Action buttons: torn-paper style, only show legal actions (no disabled buttons)
  - TRUCO: accent/rust | ACCEPT: green | FOLD: muted/red | RAISE: gold
- When not your turn: hand visible but dimmed
- Semi-transparent background

**Game log:**
- Collapsed default: single line showing last action ("GPT-4o played 3 of spades")
- Tap to expand: scrollable panel, max-height ~40vh, overlays table
- "Fechar" clearly visible at top-right of expanded panel
- Speed controls (0.5x, 1x, 2x) inside expanded log only

**Turn countdown:** Small circular indicator next to active player's name in score bar.

---

### 8. Transitions & Polish

**Lobby → Gameplay:** Fade out (200ms) → fade in (200ms). Background switches simultaneously.

**Gameplay → Lobby:**
- Back arrow triggers confirmation if game active: "Sair do jogo?"
- Game over: direct return, no confirmation
- Same fade transition

**Game over overlay:**
- Full-screen on mobile
- Large result + final score
- Two buttons: "Jogar novamente" (rematch) + "Voltar" (lobby)
- Torn-paper style

**Toasts:** Position above fixed hand area. Max-width 80vw on mobile.

**Orientation:** No forced orientation. Portrait primary, landscape via natural reflow.

---

## Decision Log

| # | Decision | Alternatives | Rationale |
|---|---|---|---|
| 1 | Incremental refactor (Approach A) | Mobile wrapper, CSS-only | Mix of layout + behavior bugs; no architectural overhead |
| 2 | i18n → select dropdown | Keep 3 buttons, flag icons | Saves 60px horizontal, user requested |
| 3 | Mode tabs → compact chips after selection | Disappear, stay full, icon | Allows switching without refresh, saves space |
| 4 | Remove seat x-buttons | Reposition, swipe-to-remove | Less clutter, consistent interaction |
| 5 | Remove scale-[0.85], use responsive sizing | Keep scale, CSS zoom | Scale causes blurry text; native sizing cleaner |
| 6 | Settings behind Advanced toggle | Always visible, bottom sheet | Most users won't change; reduces noise |
| 7 | Defaults: 30s timeout, economy prompt | Keep 60s/standard | Cheapest + fastest for mobile |
| 8 | Minimal gameplay header | Full header, auto-hide | Every pixel matters mid-game |
| 9 | Card count instead of card-back spread | Smaller backs, hide cards | Saves ~80px per opponent |
| 10 | Fixed bottom hand + contextual actions | Inline, FAB | Hand+actions = top priority |
| 11 | Log collapsed, last-action one-liner | Always open, tab, sheet | Accessible but not stealing space |
| 12 | Clean gameplay bg, newspaper lobby | Everywhere, nowhere | Visual separation; cards need contrast |
| 13 | Simple fade transitions | Slide, none, complex | Snappy without overhead |
| 14 | Vira to top-left corner | Centered, hover-reveal | Frees center for tricks |
| 15 | GitHub link to footer | Keep in header, remove | Not in-session action |
