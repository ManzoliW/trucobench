# Truco Paulista — Complete Rules

This document describes the rules of **Truco Paulista** (São Paulo variant), the version implemented in TrucoBench. This serves as the reference for engine implementation and as an appendix for the paper.

## Overview

Truco Paulista is a two-player (or two-team) trick-taking card game with imperfect information, bluffing via escalation, and a unique manilha (trump) system. A game is played to **12 points**.

## The Deck

A **40-card** Spanish-suited deck is used. The standard 52-card deck is reduced by removing all 8s, 9s, and 10s.

**Suits:** Ouros (♦), Espadas (♠), Copas (♥), Paus (♣)

**Ranks (10 total):** 4, 5, 6, 7, Q (Dama), J (Valete), K (Rei), A (Ás), 2, 3

## Card Strength

The base card strength ordering from weakest to strongest:

```
4 < 5 < 6 < 7 < Q < J < K < A < 2 < 3
```

Note that in standard Truco, suits do **not** break ties between non-manilha cards of the same rank. Two Kings of different suits are considered equal in strength (the trick is a draw).

## Dealing and the Vira

Each round:
1. The deck is shuffled.
2. Each player is dealt **3 cards**.
3. One card is flipped face-up — this is the **vira** (turn card).

The vira determines the **manilhas** for this round.

## Manilhas

The four cards whose rank is **one step above** the vira's rank (in the cyclic ordering) become the **manilhas** — the strongest cards in the game for that round.

**Rank cycle:** 4 → 5 → 6 → 7 → Q → J → K → A → 2 → 3 → 4 (wraps)

For example, if the vira is a **6**, the manilhas are all four **7s**.

Manilha strength is determined by suit (from weakest to strongest):
1. **Ouros** ♦ — weakest manilha
2. **Espadas** ♠
3. **Copas** ♥
4. **Paus** ♣ — the **Zap**, the single strongest card in the game

**Important:** The vira card itself is never a manilha. It is always just a regular card of its rank.

## Round Structure (Best of 3 Tricks)

Each round consists of up to **3 tricks**. A trick is played by each player placing one card face-up. The higher card wins the trick.

### Trick Resolution
- The player who plays first places a card.
- The other player sees it and plays their card.
- The higher card wins the trick.
- If both cards have equal strength, the trick is a **draw** (empate).

### Winner of First Trick Plays First in Subsequent Tricks
The winner of each trick leads the next trick. On a draw, the same leader continues.

### Round Winner Determination

| Trick 1 | Trick 2 | Trick 3 | Round Winner |
|---------|---------|---------|-------------|
| A wins | A wins | — | A (2-0, no trick 3 needed) |
| A wins | B wins | A wins | A (2-1) |
| A wins | B wins | B wins | B (1-2) |
| A wins | B wins | Draw | A (trick 1 winner takes draws in trick 3) |
| A wins | Draw | — | A (trick 1 winner takes the round) |
| Draw | A wins | — | A (trick 2 winner takes the round) |
| Draw | Draw | A wins | A |
| Draw | Draw | Draw | First player of the round wins |

**Key rule:** When trick 3 draws, the winner of trick 1 wins the round. When trick 1 draws, whoever wins any subsequent trick wins the round.

## Escalation (Truco)

The escalation mechanic is what makes Truco unique among card games. At any point during card play, the active player can **call Truco** instead of playing a card, raising the stakes.

### Escalation Levels

| Level | Points | Call Name |
|-------|--------|-----------|
| Normal | 1 | — |
| Truco | 3 | "Truco!" |
| Seis | 6 | "Seis!" |
| Nove | 9 | "Nove!" |
| Doze | 12 | "Doze!" |

### Escalation Flow

When a player calls Truco (or raises), the opponent must choose one of three responses:

1. **Accept** — Play continues at the new, higher stake.
2. **Raise** — Accept the current call AND counter-escalate to the next level. The original caller must now respond.
3. **Fold** — Concede the round. The caller wins the points at the **previous** stake level (before the escalation).

### Escalation Constraints

- Only the team that **did not** make the last escalation call can escalate.
- You cannot escalate beyond Doze (12 points).
- You can call Truco at any time during your turn (before playing a card).

### Example Escalation Chain

1. Player A calls **Truco** (requesting 3 points).
2. Player B **raises** to **Seis** (accepting 3 and requesting 6).
3. Player A **raises** to **Nove** (accepting 6 and requesting 9).
4. Player B **accepts** (plays at 9 points).

If Player B had folded at step 2, Player A would have won **1 point** (the Normal stake before Truco was requested).

## Mão de Onze (Hand of Eleven)

When a team reaches exactly **11 points**, special rules apply for the next round:

1. The team at 11 points gets to **see their 3 cards** before deciding to play or fold.
2. If they **fold**, the opponent receives **1 point**.
3. If they **accept** (choose to play), the round is worth **3 points** (equivalent to Truco level).
4. The team at 11 points **cannot** call Truco during this round (the escalation was automatic).

## Mão de Ferro (Iron Hand)

When **both** teams are at **11 points**:

- The round is played normally, worth **3 points** (the game-deciding round).
- **No escalation** is allowed (stakes are fixed).
- Both players can see their cards normally.

## Scoring

- The game is played to **12 points**.
- After each round, the winner's team receives the appropriate number of points based on the escalation level.
- The first team to reach 12 or more points wins the game.

## TrucoBench Simplifications

The following simplifications are made for the benchmark:

1. **Two-player only** — no 4-player team variant. This eliminates partner signaling (sinais), which is a rich but separate research question.
2. **No sinais** — in traditional Truco, teammates use subtle facial signals to communicate hand strength. This is not modeled.
3. **Simultaneous mão de ferro** — when both at 11, both see cards and play normally. Some variants have additional rules here.
