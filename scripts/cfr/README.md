# CFR — Nash Equilibrium Solver for Truco Paulista

This directory contains a pure-Python implementation of **Outcome Sampling Monte Carlo CFR (OS-MCCFR)** for Truco Paulista (2-player), providing a **game-theoretic optimal baseline** for the TrucoBench paper.

## Files

| File | Purpose |
|---|---|
| `truco_engine.py` | Pure-Python re-implementation of the game engine (mirrors `packages/engine/src/`) |
| `cfr_solver.py` | OS-MCCFR solver, `RegretTable`, `CFRAgent`, evaluation harness |
| `__init__.py` | Package exports |
| `truco_cfr_strategy.pkl` | *(generated)* Trained strategy table |

## Quick start

```bash
# Train for 500k iterations (~30 min on CPU)
python scripts/cfr/cfr_solver.py \
  --iterations 500000 \
  --out scripts/cfr/truco_cfr_strategy.pkl \
  --eval 5000 \
  --eval_opponent heuristic

# Resume from checkpoint and add more iterations
python scripts/cfr/cfr_solver.py \
  --load scripts/cfr/truco_cfr_strategy.pkl \
  --iterations 500000 \
  --out scripts/cfr/truco_cfr_strategy.pkl

# Evaluate only
python scripts/cfr/cfr_solver.py \
  --load scripts/cfr/truco_cfr_strategy.pkl \
  --iterations 0 \
  --eval 10000 \
  --eval_opponent heuristic
```

## Convergence guide

| Iterations | Info-states | Expected win-rate vs Random | Time (CPU) |
|---|---|---|---|
| 10,000 | ~2k | ~55% | < 1 min |
| 100,000 | ~15k | ~60–65% | ~5 min |
| 500,000 | ~50k | ~68–72% | ~25 min |
| 2,000,000 | ~100k | ~72–75% | ~2 hours |

## Card abstraction

To keep the strategy table tractable, cards are mapped to **6 strength buckets** before being encoded in the info-state string:

| Bucket | Strength | Examples |
|---|---|---|
| 5 — ZAP | 13 | Paus manilha |
| 4 — STRONG_MAN | 11–12 | Espadas + Copas manilha |
| 3 — WEAK_MAN | 10 | Ouros manilha |
| 2 — HIGH | 8–9 | 2, 3 |
| 1 — MID | 5–7 | J, K, A |
| 0 — LOW | 0–4 | 4, 5, 6, 7, Q |

## Research use

Once trained, the `CFRAgent` can be added to any TrucoBench tournament to compute **Nash Distance** metrics:

```python
from scripts.cfr.cfr_solver import CFRAgent

cfr_agent = CFRAgent.load("scripts/cfr/truco_cfr_strategy.pkl", player_id=0)
# Then: cfr_agent.choose_action(game) → int action
```

The Nash Distance of any other agent is its win-rate against the CFR agent subtracted from 0.5 (a perfect Nash strategy should win 50% against itself).
