# UX Roadmap — TrucoBench Web UI

**Date:** 2026-04-04
**Status:** Design approved, pending implementation
**Goal:** Take TrucoBench from functional to a polished product people use and share
**Team:** Solo + Claude Code
**Sequencing principle:** Shareability-first — optimize the viral loop: play -> impressive result -> share -> someone clicks -> they play

---

## Understanding Summary

- **What:** 5 UX areas to polish: game-over/results, onboarding, leaderboard, spectator mode, partner signals
- **Why:** Make TrucoBench a product people actually use and share on social media
- **Who:** General audience discovering via social links, GitHub, or arxiv paper
- **Constraints:** Build on existing components, no new backend/database, newspaper aesthetic, mobile 360px+
- **Non-goals:** No new game mechanics, no engine changes, no user accounts, no analytics

## Assumptions

- Existing web UI (with mobile redesign) is the foundation
- OG images generated for dynamic content (game results, stats)
- No server-side persistence — localStorage + URL-encoded data
- All new features consistent with newspaper/ransom-note aesthetic
- No global leaderboard (would require database)

---

## Sequence

| Order | Area | Effort | Share Impact |
|-------|------|--------|-------------|
| 1 | Game-over / results screen | Medium | Critical — the share trigger |
| 2 | Onboarding / first-time flow | Small | Critical — the landing page |
| 3 | Results dashboard / leaderboard | Medium | High — social proof, replayability |
| 4 | Spectator mode UX | Medium | High — content piece, wow-factor |
| 5 | Partner signals UX (4P) | Small | Low — polish on existing feature |

---

## 1. Game-Over / Results Screen

### Current state
Simple overlay: "You win/lost" + score + two buttons. No stats, no share.

### Design

**Full-screen results card (torn-paper aesthetic):**

```
+----------------------------------+
|         VICTORY!                 |  <- RansomTitle style
|                                  |
|        12  --  8                 |  <- Large final score
|    You + Heuristic               |
|    vs GPT-4o + DeepSeek R1       |
|                                  |
|  +----------------------------+  |
|  | Rounds: 7                  |  |
|  | Trucos called: 4 (won 3)   |  |
|  | Bluffs: 2 successful       |  |
|  | Best play: Zap on trick 3  |  |
|  | Time: 3m 42s               |  |
|  +----------------------------+  |
|                                  |
|  [Share]  [Rematch]              |
|         [Back to lobby]          |
+----------------------------------+
```

**Share button:**
- Generates URL: `/results/[gameId]`
- New API route serves results page with proper `og:image`, `og:title`, `og:description` meta tags
- OG image: auto-generated card showing score, models, key stat — newspaper aesthetic
- Web Share API with copy-to-clipboard fallback
- Share text: "I beat GPT-4o at Truco Paulista! 12-8 Try it: [link]"

**Stats collected from game log:**
- Rounds played
- Trucos called / accepted / folded
- Bluff attempts (truco on weak hand)
- Manilhas played
- Game duration

### Files to create/modify
- `packages/web/app/results/[gameId]/page.tsx` — results page with OG meta
- `packages/web/app/api/og/route.tsx` — OG image generation (edge runtime)
- `GameBoard.tsx` — collect stats during game, pass to results overlay
- `Table.tsx` — rematch flow (same config, new game)

---

## 2. Onboarding / First-Time Flow

### Current state
User lands on page, sees templates + empty table. No explanation of what TrucoBench is.

### Design

**Hero section for first-time visitors only:**

```
+----------------------------------+
|       TrucoBench                 |
|  Truco Paulista com IA           |
|                                  |
|  "Play the Brazilian card game   |
|   against the world's best       |
|   AI models. Who bluffs better   |
|   -- you or GPT-4o?"            |
|                                  |
|  [Play vs Bot]  <- one-tap       |
|   No API key needed              |
+----------------------------------+
```

**First-time detection:**
- `localStorage` flag: `trucobench-visited`
- Not set: show hero with tagline + single CTA
- CTA: "Play vs Bot" triggers "You vs Bot" template directly (zero friction)
- Below CTA: "or choose your opponent" scrolls to template picker
- After first game completes: set flag, never show hero again

**Returning visitors:**
- Skip hero, show compact mode chips as normal

**No tutorial needed** — the game teaches itself. Truco rules in help section.

### Files to modify
- `Table.tsx` — first-visit detection, hero section rendering, CTA wiring

---

## 3. Results Dashboard / Leaderboard

### Current state
No web-based results viewing. CLI has `report` and `leaderboard` commands.

### Design

**Client-side stats from localStorage (last 100 games):**

```
+----------------------------------+
|  Your Stats          [expand]    |
+----------------------------------+
|  Games played: 23                |
|  Win rate: 61%                   |
|                                  |
|  Model rankings (your games):    |
|  1. You -- 14W 9L (61%)         |
|  2. Heuristic -- 12W 8L (60%)   |
|  3. Claude S. -- 10W 11L (48%)  |
|  4. GPT-4o -- 8W 13L (38%)     |
|                                  |
|  [Share my stats]                |
+----------------------------------+
```

**Data model (localStorage):**
```typescript
interface GameResult {
  id: string;
  timestamp: number;
  players: { name: string; model: string; type: string }[];
  scores: [number, number];
  winner: 0 | 1;
  rounds: number;
  duration: number;
  trucosCalled: number;
  trucosWon: number;
}
```

**Share my stats:**
- Generates OG image with win rate, top model beaten, games played
- URL: `/stats?data=[base64-encoded-compact-stats]` (no server needed)

**Collapsible section in lobby, below deal button.** Torn-paper style consistent with the rest.

### Files to create/modify
- `packages/web/lib/game-history.ts` — localStorage read/write, stats computation
- `packages/web/app/components/StatsPanel.tsx` — collapsible stats display
- `packages/web/app/stats/page.tsx` — shareable stats page with OG meta
- `Table.tsx` — integrate StatsPanel
- `GameBoard.tsx` — save GameResult on game end

---

## 4. Spectator Mode UX

### Current state
AI Battle works with speed controls and game log. Feels passive — no commentary, no highlights.

### Design

**Live commentary bar (replaces collapsed log line):**

Template-based contextual one-liners:
- Played manilha: "GPT-4o plays the Zap! Strongest card in the game."
- Bluff truco: "DeepSeek calls TRUCO holding nothing. Pure bluff."
- Folded: "Claude folds -- not worth the risk."
- ~15-20 templates per locale, randomized phrasing

**Live stats panel (desktop sidebar / mobile expandable):**
```
Truco calls: Claude 3, GPT 2, DeepSeek 4, Gemini 1
Bluff rate:  DeepSeek 75% | Claude 33%
```

**Auto-speed:** Default 1.5x for spectator mode (was 1x).

**Highlight moments:** Commentary line lingers 1s longer on dramatic plays. Existing shake/flash effects already cover truco calls.

### Files to create/modify
- `packages/web/lib/commentary.ts` — template system, context -> commentary string
- `packages/web/app/components/GameBoard.tsx` — commentary bar, live stats, default speed
- `packages/web/lib/i18n.ts` — commentary templates for EN/PT/ES

---

## 5. Partner Signals UX (4P)

### Current state
Signal panel is a hidden toggle. Toasts show signal text. Functional but buried.

### Design

**Inline signal chips (always visible during 4P, your turn):**
```
Signal:  [Zap] [3] [A] [Nothing]
```
- 4 most useful signals as torn-paper chips below hand
- Tap to send immediately (no confirm)
- Dim after sending (one signal per round)
- Icons on mobile for space

**Visual signal animation:**
- Partner signal: card-themed icon floats from partner's seat toward you
- Opponent intercepts: red "eye" flash at their seat
- More theatrical than plain toast

**Signal history in game log:**
- Logged as entries: "You signaled: Zap" / "Partner signaled: Nothing"
- Intercepted signals highlighted in red

**No changes to signal mechanics** — visual/UX polish only.

### Files to modify
- `GameBoard.tsx` — inline signal chips, animation triggers
- `globals.css` — signal animation keyframes

---

## Decision Log

| # | Decision | Alternatives | Rationale |
|---|----------|-------------|-----------|
| 1 | Sequence: Results > Onboarding > Leaderboard > Spectator > Signals | Equal priority | Follows viral loop |
| 2 | Share via OG image URLs | Manual screenshots | OG images drive social clicks |
| 3 | First-time hero with single CTA | Tutorial wizard, video | Zero friction, game teaches itself |
| 4 | localStorage leaderboard, no database | Server DB | YAGNI, keeps project serverless |
| 5 | Template-based commentary | AI-generated | Predictable, fast, free, localizable |
| 6 | Spectator default 1.5x | 1x, 2x | 1x too slow, 2x too fast to read |
| 7 | Signals as inline chips | Hidden toggle | Discoverability |
| 8 | Stats in share URL as base64 | Server persistence | No infra needed |
| 9 | Results page at /results/[gameId] | Modal only | Needs own URL for OG meta |
| 10 | ~15-20 commentary templates per locale | Full NLG | Enough variety, cheap to maintain |
