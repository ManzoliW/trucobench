#!/usr/bin/env bash
set -euo pipefail

# TrucoBench — Full Experiment Suite
# Requires: API keys in .env (OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_API_KEY, DEEPSEEK_API_KEY)
# Estimated cost: ~$50-100 USD
# Estimated time: several hours (API latency)

CLI="bun run packages/cli/src/index.ts"

echo "============================================"
echo "TrucoBench — Full Experiment Suite"
echo "============================================"
echo ""

# --- Experiment 1: Main Tournament ---
echo "[1/5] Main Tournament (round-robin, 200 games/pair, duplicate)"
echo "  9 agents = 36 matchups x 200 games x 2 (dup) = 14,400 games"
$CLI tournament \
  --config experiments/01-main-tournament.json \
  --checkpoint \
  --format markdown \
  --output results/01-main-tournament/report.md

echo ""

# --- Experiment 2: Prompt Sensitivity ---
echo "[2/5] Prompt Sensitivity (top 3 models x 3 prompt variants)"
TOP3="claude-sonnet-4.6,gpt-4o,gemini-2.5-pro"
for prompt in minimal standard verbose; do
  echo "  Running prompt=$prompt..."
  for model in claude-sonnet-4.6 gpt-4o gemini-2.5-pro; do
    $CLI run \
      --a "$model" --b heuristic \
      --games 100 --duplicate \
      --prompt "$prompt" \
      --output "results/02-prompt-sensitivity"
  done
done

echo ""

# --- Experiment 3: Language Bias ---
echo "[3/5] Language Bias (top 3 models x en/pt)"
for lang in en pt; do
  echo "  Running language=$lang..."
  for model in claude-sonnet-4.6 gpt-4o gemini-2.5-pro; do
    $CLI run \
      --a "$model" --b heuristic \
      --games 100 --duplicate \
      --language "$lang" \
      --output "results/03-language-bias"
  done
done

echo ""

# --- Experiment 4: Temperature Sensitivity ---
echo "[4/5] Temperature Sensitivity (best model x 4 temps)"
# Using claude-sonnet-4.6 as the reference model; change if a different model wins Exp 1
BEST_MODEL="claude-sonnet-4.6"
for temp in 0.0 0.3 0.7 1.0; do
  echo "  Running temperature=$temp..."
  $CLI run \
    --a "$BEST_MODEL" --b heuristic \
    --games 100 --duplicate \
    --temperature "$temp" \
    --output "results/04-temperature"
done

echo ""

# --- Experiment 5: Baselines ---
echo "[5/5] Baselines (every model vs random + heuristic)"
ALL_MODELS="claude-sonnet-4.6 claude-haiku-4.5 gpt-4o gpt-4o-mini gemini-2.5-pro gemini-2.5-flash deepseek-r1"
for model in $ALL_MODELS; do
  echo "  $model vs random..."
  $CLI run --a "$model" --b random --games 200 --duplicate --output "results/05-baselines"
  echo "  $model vs heuristic..."
  $CLI run --a "$model" --b heuristic --games 200 --duplicate --output "results/05-baselines"
done

echo ""
echo "============================================"
echo "All experiments complete!"
echo "Results saved to results/"
echo ""
echo "Generate combined report:"
echo "  $CLI report --input results/01-main-tournament/*.json --format markdown"
echo "============================================"
