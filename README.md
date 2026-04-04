# TrucoBench

An LLM benchmark for **Truco Paulista** — the first game-theoretic evaluation of large language models on Latin American card games.

TrucoBench measures how well AI models handle imperfect information, bluffing, and nested escalation mechanics. It produces ELO ratings, bluff analysis, reasoning trace classification, and cost-efficiency metrics across frontier and open-source models.

## Quick Start

```bash
# Install
bun install

# Run a quick game (no API keys needed)
bun run packages/cli/src/index.ts run --a random --b heuristic --games 100

# Run with LLM agents (requires API keys in .env)
cp .env.example .env  # fill in your keys
bun run packages/cli/src/index.ts run --a claude-sonnet-4.6 --b gpt-4o --games 5

# Run a round-robin tournament
bun run packages/cli/src/index.ts tournament --models random,heuristic --games 50

# Full tournament with LLMs
bun run packages/cli/src/index.ts tournament \
  --config experiments/01-main-tournament.json \
  --checkpoint --output results/report.md
```

## Web UI

```bash
bun run packages/web dev   # http://localhost:3000
```

Play interactively against AI models in your browser. The lobby supports four provider modes — switch between them with the pill toggle on the table:

| Mode | Key | What you get |
|------|-----|--------------|
| **Direct APIs** | One key per provider | Per-provider keys (OpenAI, Anthropic, Google, DeepSeek) |
| **Vercel Gateway** | `vck_...` | Single key for all commercial models |
| **OpenRouter** | `sk-or-...` | Single key for all models via openrouter.ai |
| **Hugging Face** | `hf_...` | Open-source models (Llama, Mistral, Qwen, Gemma, Phi) + your own fine-tunes |

Keys are entered in the seat picker and stored in your browser only (localStorage).

## Architecture

```
packages/
├── engine/    Pure Truco Paulista game engine (zero dependencies)
├── agents/    Agent interface + RandomAgent, HeuristicAgent, LLM agents
├── bench/     Tournament runner, metrics, ELO, reasoning traces, reports
├── cli/       CLI entrypoint (run, tournament, report, leaderboard)
└── web/       Next.js web UI with real-time game streaming
```

**Engine** — Gym-style API: `reset()`, `observe()`, `step()`, `getLegalActions()`. Deterministic with seeded PRNG. Handles all Truco rules: 3-trick rounds, manilhas, escalation FSM (truco->seis->nove->doze), mao de onze, mao de ferro.

**Agents** — Each LLM gets a text prompt describing the game state and responds with JSON. Three prompt variants (minimal/standard/verbose) x two languages (English/Portuguese). 3-retry parse logic with fallback. Rate limiting with exponential backoff.

**Bench** — Round-robin with duplicate format (hand-swapping) and checkpoint/resume. Metrics: win rate, ELO, bluff success/detection, escalation depth, fold rate, parse failure rate, cost/hand. Reasoning trace classification into 6 patterns (CARD_STRENGTH, SCORE_AWARENESS, OPPONENT_MODELING, BLUFF_REASONING, ESCALATION_LOGIC, POSITIONAL).

## Available Agents

| Agent | Type | Description |
|-------|------|-------------|
| `random` | Baseline | Uniform random from legal actions |
| `heuristic` | Baseline | Rule-based: saves manilhas, plays weakest winner |
| `claude-sonnet-4.6` | LLM | Anthropic Claude Sonnet 4.6 |
| `claude-haiku-4.5` | LLM | Anthropic Claude Haiku 4.5 |
| `gpt-4o` | LLM | OpenAI GPT-4o |
| `gpt-4o-mini` | LLM | OpenAI GPT-4o-mini |
| `gemini-2.5-pro` | LLM | Google Gemini 2.5 Pro |
| `gemini-2.5-flash` | LLM | Google Gemini 2.5 Flash |
| `deepseek-r1` | LLM | DeepSeek-R1 |
| `ollama/<model>` | LLM (local) | Any Ollama model (e.g. `ollama/llama3.3`) |

**Hugging Face models** (web UI only): Switch to HF mode in the seat picker and use any model on the Hub — popular models like `meta-llama/Llama-3.3-70B-Instruct`, `Qwen/Qwen2.5-72B-Instruct`, `microsoft/Phi-4`, or your own fine-tunes (`your-username/truco-finetune`). Requires an HF token.

## Reproducing Paper Results

All five experiments from the paper can be run with a single command:

```bash
cp .env.example .env  # fill in API keys
bash experiments/run-all.sh
```

Or run experiments individually:

```bash
# Experiment 1: Main tournament (round-robin, 200 games/pair)
bun run packages/cli/src/index.ts tournament --config experiments/01-main-tournament.json --checkpoint

# Experiment 2: Prompt sensitivity (minimal/standard/verbose)
bun run packages/cli/src/index.ts run --a claude-sonnet-4.6 --b heuristic --games 100 --prompt minimal
bun run packages/cli/src/index.ts run --a claude-sonnet-4.6 --b heuristic --games 100 --prompt verbose

# Experiment 3: Language bias (English vs Portuguese)
bun run packages/cli/src/index.ts run --a gpt-4o --b heuristic --games 100 --language pt

# Experiment 4: Temperature sensitivity
bun run packages/cli/src/index.ts run --a claude-sonnet-4.6 --b heuristic --games 100 --temperature 0.0

# Experiment 5: Baselines (all models vs random + heuristic)
bun run packages/cli/src/index.ts run --a deepseek-r1 --b random --games 200 --duplicate
```

Generate a report from saved results:

```bash
bun run packages/cli/src/index.ts report --input results/01-main-tournament/tournament-*.json --format markdown
```

## Adding a New Model

**Web UI (easiest):** Switch to Hugging Face, OpenRouter, or Vercel Gateway mode — any model available on those platforms works immediately. For HF, you can also type in a custom model ID (including your own fine-tunes).

**CLI:**
1. If your provider uses an OpenAI-compatible API, add an entry in `packages/cli/src/index.ts` using `OpenAIProvider` with a custom `baseURL`.
2. For a new provider SDK, create an adapter in `packages/agents/src/providers/` implementing the `LLMProvider` interface (one method: `chat(messages, temperature)`).
3. Register it in the CLI's `providerMap`.

## Development

```bash
bun test                   # Run all tests (149 tests, <1s)
bun test packages/engine   # Test a specific package
biome check .              # Lint + format check
biome check --write .      # Auto-fix
bun run packages/web dev   # Start web UI on localhost:3000
```

## Citation

If you use TrucoBench in your research, please cite:

```bibtex
@software{manzoli2026trucobench,
  title={TrucoBench: Evaluating LLM Strategic Reasoning Through Truco Paulista},
  author={Manzoli, William},
  year={2026},
  url={https://github.com/ManzoliW/trucobench}
}
```

## License

MIT
