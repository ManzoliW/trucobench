# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TrucoBench is an LLM benchmark for Truco Paulista — a Latin American card game with imperfect information and escalation mechanics. The project evaluates how well different AI models play Truco, measuring strategic reasoning, bluffing, and chain-of-thought quality. The end goal is an arxiv paper. See `ROADMAP.MD` for full phased plan.

## Tech Stack

- **Runtime/Package Manager:** Bun
- **Language:** TypeScript (strict mode, path aliases)
- **Linting/Formatting:** Biome (tabs, double quotes, semicolons, 100-char line width)
- **Testing:** Bun's built-in test runner
- **CI:** GitHub Actions

## Commands

```bash
bun install                              # Install dependencies
bun test                                 # Run all tests
bun test packages/engine                 # Run tests for a specific package
bun test packages/engine/tests/deck.test.ts  # Run a single test file
bun run check                            # Lint + format check (alias: biome check .)
bun run check:fix                        # Lint + format with auto-fix (alias: biome check --write .)
bun run packages/web dev                 # Start web UI (http://localhost:3000, uses Turbopack)
bun run packages/web build               # Production build of web UI
```

### CLI

```bash
bun run packages/cli/src/index.ts run --a random --b random --games 10
bun run packages/cli/src/index.ts run --a claude-sonnet-4.6 --b gpt-4o --games 5
bun run packages/cli/src/index.ts tournament --config experiments/01-main-tournament.json --checkpoint
bun run packages/cli/src/index.ts tournament --models random,heuristic --games 50
bun run packages/cli/src/index.ts report --input results/latest --format markdown
```

### Experiments

Pre-configured experiments live in `experiments/`. Run all with `bash experiments/run-all.sh`, or run individually (see `README.md` for details). The `experiments/generate-prompt-examples.ts` script generates sample prompts for documentation.

## Monorepo Architecture

Five packages under `packages/`, imported via path aliases (`@trucobench/engine`, `@trucobench/agents`, `@trucobench/bench`):

### `engine/` — Game Logic (zero external dependencies)
Pure, deterministic Truco Paulista engine. Gym-style API:
- `reset(): GameState` — new game, shuffle, deal, draw vira
- `observe(playerId): Observation` — imperfect-info view (no opponent hand)
- `step(playerId, action): StepResult` — validate action, advance state
- `getLegalActions(playerId): Action[]` — all currently legal actions

Action space: `PLAY_CARD(cardIndex)`, `TRUCO`, `ACCEPT`, `RAISE`, `FOLD`

Both `Game` and `Game4P` constructors accept an options object: `{ seed?, trucoTiming?, signalConfig? }`. The `trucoTiming` setting (`"anytime" | "after-first-card" | "after-first-trick"`, default `"after-first-trick"`) controls when TRUCO can be called.

Also includes `Game4P` (`game4p.ts`) — a 4-player team variant with teams [0,2] vs [1,3], partner signals (`signals.ts`), and chat. Helpers: `teamOf(seat)`, `partnerOf(seat)`, `nextSeat(seat)`.

**4P Escalation mechanics:** When TRUCO is called, `getCurrentSeat()` returns `null` — both members of the responding team can independently accept/fold/raise (first response wins). `EscalationState.initiatedBySeat` tracks who was active when escalation started, restoring their turn after resolution.

**Critical constraint:** The `Observation` type must guarantee no information leak — opponent hand is never visible.

### `agents/` — LLM Agent Adapters
Abstract `Agent` interface: `getAction(observation): Promise<Action>`. Includes random agent (baseline floor), heuristic agent (baseline ceiling with seeded bluffing/signaling), and LLM agents with per-provider native SDKs (openai, anthropic, google, deepseek, ollama). Also supports OpenRouter and Vercel Gateway via `AiSdkProvider` (`providers/ai-sdk.ts`). Prompt serializer has four variants (`economy`, `minimal`, `standard`, `verbose`) in English and Portuguese. Parser has 3-retry logic with fallback to weakest legal action.

LLM response format:
```json
{"reasoning": "chain-of-thought", "action": "PLAY_CARD|TRUCO|ACCEPT|RAISE|FOLD", "card_index": 0}
```

### `bench/` — Benchmark Runner & Metrics
Round-robin tournament with checkpoint/resume, duplicate format (swap hands), seed management. Metrics: win rate, ELO, bluff success/detection, escalation depth, fold rate, manilha utilization, parse failure rate, cost/hand. CoT reasoning trace classification into 6 patterns (CARD_STRENGTH, SCORE_AWARENESS, OPPONENT_MODELING, BLUFF_REASONING, ESCALATION_LOGIC, POSITIONAL).

### `cli/` — CLI Entrypoint
Commands: `run` (single matchup), `tournament` (round-robin), `report` (generate reports), `leaderboard`

### `web/` — Next.js Web Interface
Interactive game UI with real-time streaming. Uses Next.js 16, React 19, Tailwind 4. Single-screen "Living Table" design — lobby (seat picking) and gameplay happen on the same table. Magazine/newspaper cut-out aesthetic with torn-paper CSS effects, ransom-note typography (`RansomTitle`, `RansomLabel` components), and parchment color palette.

API routes under `/app/api/game/` handle game creation, state queries, action submission, SSE streaming, chat, and signals. `/api/og/` generates dynamic OG images for game result sharing. `/results` page renders shareable results with dynamic OG meta tags.

Key components: `Table.tsx` (main orchestrator + lobby), `GameBoard.tsx` (gameplay + hand area), `Seat.tsx` (player slots), `SeatPicker.tsx` (model/key picker), `Card.tsx` (card rendering), `RansomTitle.tsx` (cut-out letter styling).

Key libs: `game-stats.ts` (stats aggregation), `game-history.ts` (localStorage persistence + base64url share encoding), `commentary.ts` (template-based spectator commentary), `i18n.ts` (EN/PT/ES translations).

Supports provider modes: direct API keys, OpenRouter, Vercel AI Gateway (default), Hugging Face. Default models use cheapest options (Haiku, GPT-4o Mini, Gemini Flash, DeepSeek R1). Default settings: 30s timeout, economy prompt mode.

Mobile-first responsive design targeting 360px+. Gameplay uses fixed-bottom hand area on mobile (via `--hand-h` CSS variable), inline on desktop. Game log collapses to single commentary line on mobile. First-visit onboarding hero with zero-friction "Play vs Bot" CTA.

## Environment Variables

```bash
# Direct provider keys (for native SDKs and web UI)
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
GOOGLE_API_KEY=...
DEEPSEEK_API_KEY=...
OLLAMA_BASE_URL=http://localhost:11434

# Unified key options (one key for multiple models)
OPENROUTER_API_KEY=...
VERCEL_AI_GATEWAY_API_KEY=...
HF_TOKEN=...
```

The web UI also supports per-session API keys entered in the frontend (stored in localStorage, passed via request headers).

## Key Design Decisions

- Engine has zero external dependencies — pure game logic only
- All LLM providers use their native SDKs, not a unified wrapper
- Temperature fixed at 0.7 by default across all models
- Parse failure rate is itself a benchmark metric — don't hide it
- Duplicate format (hand-swapping) reduces variance in results
- The `results/` directory is gitignored; raw API responses are archived separately
- Game rules documentation in `docs/RULES.md`; POSG formalization in `docs/FORMALIZATION.md`
- Heuristic agent uses seeded PRNG for deterministic bluffing/signaling decisions
- Web UI uses SSE (Server-Sent Events) for real-time game streaming with closed-flag guard against ERR_INVALID_STATE
- Default provider mode is Vercel Gateway (single key for all models)
- Game results stored in localStorage (max 100, FIFO) — no server-side persistence
- Share links encode game results as base64url in URL params — no database needed
- `torn-paper` CSS class uses `clip-path` polygon for jagged edges + `isolation: isolate` for nesting
- Design docs in `docs/`: `MOBILE-REDESIGN.md`, `UX-ROADMAP.md`, `TRUCO-RULES-FIX.md`

## Truco Paulista Quick Reference

This is essential domain knowledge for implementing the engine correctly.

**Deck:** 40 cards (standard 52 minus 8s, 9s, 10s). Four suits: espadas, copas, ouros, paus.

**Card strength (low to high):** `4 < 5 < 6 < 7 < Q < J < K < A < 2 < 3`

**Manilhas:** The vira (community card) is flipped at round start. The four cards of rank (vira+1) become manilhas — the strongest cards. Manilha suit strength: `♦ ouros < ♠ espadas < ♥ copas < ♣ paus`. Paus manilha = "zap" (strongest card in the game). The vira card itself is never a manilha.

**Round structure:** Best of 3 tricks. Each player plays one card per trick, highest wins. Draw rules: trick 1 draw → both teams win that trick; trick 2/3 draw → first trick winner takes the round.

**Escalation FSM:** `NORMAL(1pt) → TRUCO(3pt) → SEIS(6pt) → NOVE(9pt) → DOZE(12pt)`. On escalation, opponent can ACCEPT, RAISE (counter-escalate), or FOLD (caller wins pre-escalation points). Only the team that didn't last escalate can escalate. TRUCO timing is configurable: `"after-first-trick"` (default — no TRUCO until trick 1 resolves), `"after-first-card"`, or `"anytime"`. In 4P, both members of the responding team can independently decide — first response wins. TRUCO doesn't consume a turn; the caller resumes play after resolution.

**Mão de onze:** When a team reaches 11 points, they see their hand and decide to play or fold (1pt to opponent). Mão de ferro: both teams at 11 — special rules apply.

**Game end:** First team to 12 points wins.
