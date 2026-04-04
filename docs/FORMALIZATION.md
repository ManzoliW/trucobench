# Truco Paulista — POSG Formalization

Notes for the paper's formal model (Section 4).

## Partially Observable Stochastic Game (POSG)

Truco Paulista is modeled as a two-player POSG:

**⟨ N, S, {A_i}, {O_i}, T, O, R ⟩**

### Players

N = {1, 2}

### State Space S

A state s ∈ S is a tuple:

```
s = (D, h₁, h₂, v, τ, e, σ, p)
```

| Component | Description | Domain |
|-----------|-------------|--------|
| D | Deck permutation | Permutations of 40 cards |
| h₁, h₂ | Player hands | Subsets of C, \|hᵢ\| ≤ 3 |
| v | Vira card | C |
| τ | Trick history | Sequence of (card, card) tuples |
| e | Escalation state | (level, pending, lastBy) |
| σ | Game score | {0,...,12}² |
| p | Current player | N ∪ {chance} |

### Card Set C

|C| = 40. Ten ranks × four suits.

Ranks: {4, 5, 6, 7, Q, J, K, A, 2, 3}
Suits: {♦, ♠, ♥, ♣}

### Observation Function O

Player i observes:

```
oᵢ = (hᵢ, v, |h₋ᵢ|, τ, e, σ)
```

Key property: **h₋ᵢ is never observed** — this is the source of imperfect information.

### Action Space A_i

Context-dependent:

| Context | Available Actions |
|---------|-------------------|
| Card play (my turn) | PLAY_CARD(j) for j ∈ {0,...,\|hᵢ\|-1}, TRUCO |
| Escalation response | ACCEPT, RAISE, FOLD |
| Mão de onze decision | ACCEPT, FOLD |

### Escalation State Machine

```
e = (l, p, r) where:
  l ∈ L = {NORMAL, TRUCO, SEIS, NOVE, DOZE}  — current level
  p ∈ L ∪ {⊥}                                  — pending request
  r ∈ N ∪ {⊥}                                  — last escalator
```

Transitions:

| Current State | Action | New State |
|---------------|--------|-----------|
| (l, ⊥, r) | TRUCO by i (where i ≠ r) | (l, next(l), i) |
| (l, p, j) | ACCEPT by i (i ≠ j) | (p, ⊥, j) |
| (l, p, j) | RAISE by i (i ≠ j) | (p, next(p), i) |
| (l, p, j) | FOLD by i (i ≠ j) | Round ends, j wins points(l) |

Where `next(l)` returns the next level: NORMAL→TRUCO→SEIS→NOVE→DOZE.

### Card Strength Function

```
strength(c, v) =
  if rank(c) = manilhaRank(v):
    10 + suitStrength(suit(c))    — manilha
  else:
    rankStrength(rank(c))          — regular card
```

Where:
- `manilhaRank(v) = next(rank(v))` in the rank cycle
- `suitStrength: ♦=0, ♠=1, ♥=2, ♣=3`
- `rankStrength: 4=0, 5=1, 6=2, 7=3, Q=4, J=5, K=6, A=7, 2=8, 3=9`

### Trick Resolution

```
trickWinner(c₁, c₂, v) =
  if strength(c₁, v) > strength(c₂, v): player1
  if strength(c₁, v) < strength(c₂, v): player2
  else: DRAW
```

### Round Resolution

Best of 3 tricks with draw handling (see RULES.md for the complete table).

### Reward Function R

```
R(s, a) = points(escalation.level) × winner_indicator
```

Points: NORMAL=1, TRUCO=3, SEIS=6, NOVE=9, DOZE=12.

Terminal reward: game ends when max(σ₁, σ₂) ≥ 12.

## Complexity Analysis

| Property | Value |
|----------|-------|
| Deck size | 40 |
| Hand size | 3 |
| Max tricks per round | 3 |
| Escalation levels | 5 |
| Rounds per game | ~8-15 (empirical) |
| Actions per trick | 2 (one per player) |
| Information set size | Bounded by C(37,3) × 5 × 3 per round |

## Comparison with Texas Hold'em

| Property | Truco Paulista | Texas Hold'em |
|----------|---------------|---------------|
| Players | 2 (or 2 teams of 2) | 2-10 |
| Deck | 40 cards | 52 cards |
| Private cards | 3 | 2 |
| Public cards | 0 (played cards visible) | 5 (staged) |
| Trump/wild | Manilhas (4 cards, vira-dependent) | None |
| Rounds per game | Variable (~8-15) | 1 |
| Bluff mechanism | Discrete escalation (5 levels) | Continuous bet sizing |
| Escalation responses | 3 (accept/raise/fold) | Continuous |
| State space | Smaller (3 cards, 3 tricks) | Larger (staged community) |
| Game length metric | Points (first to 12) | Chips |
| Perfect recall | Yes | Yes |
