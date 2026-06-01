# TrucoBench

<p align="center">
  <img src="https://img.shields.io/badge/status-work--in--progress-orange?style=for-the-badge" alt="Work in Progress">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Bun-1.3+-black?style=flat-square&logo=bun" alt="Bun">
  <img src="https://img.shields.io/badge/TypeScript-5.0+-blue?style=flat-square&logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js" alt="Next.js">
  <img src="https://img.shields.io/badge/Linter-Biome-yellow?style=flat-square&logo=biome" alt="Biome">
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License">
</p>

An LLM benchmark for **Truco Paulista** — the first game-theoretic evaluation of large language models on Latin American card games.

TrucoBench measures how well AI models handle imperfect information, bluffing, and nested escalation mechanics. It produces ELO ratings, bluff analysis, reasoning trace classification, and cost-efficiency metrics across frontier and open-source models.

---

## 🧪 Latest Diagnostic Results (Preview)

Our latest frontier evaluation shows a clear **Knowing-Doing Gap**:

| Model | Overall | Bluff | Defense | Logic | Escalation |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **GPT-4o** | **71.1%** | 100% | 100% | 100% | 60% |
| **GPT-4o-mini** | **71.1%** | 100% | 40% | 100% | 100% |

> **Key Discovery**: While frontier models excel at psychological tactics (100% bluffing), they struggle with sequential card math—frequently wasting high-value cards early in the round.

---

## Quick Start

```bash
# Install
bun install

# Run a quick game (no API keys needed)
bun run cli run --a random --b heuristic --games 100

# Run diagnostic evaluation (IQ Test)
bun run cli eval --model heuristic --scenarios experiments/diagnostics-v1.json

# Run with LLM agents (requires API keys in .env)
cp .env.example .env  # fill in your keys
bun run cli run --a gpt-4o-mini --b heuristic --games 5 --provider vercel
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

## Architecture

```
packages/
├── engine/    Pure Truco Paulista game engine (zero dependencies)
├── agents/    Agent interface + RandomAgent, HeuristicAgent, LLM agents
├── bench/     Tournament runner, metrics, ELO, reasoning traces, reports, diagnostics
├── cli/       CLI entrypoint (run, tournament, eval, report, leaderboard)
└── web/       Next.js web UI with real-time game streaming
```

## Reproducing Paper Results

All five experiments from the paper can be run with a single command:

```bash
cp .env.example .env  # fill in API keys
bash experiments/run-all.sh
```

Generate a diagnostic report:

```bash
bun run cli eval --model gpt-4o --provider vercel --scenarios experiments/diagnostics-v1.json --output results/diag.json
```

## Development

```bash
bun test                   # Run all tests (149 tests, <1s)
bun test packages/engine   # Test a specific package
bun run check              # Lint + format check
bun run check:fix          # Auto-fix
bun run packages/web dev   # Start web UI on localhost:3000
```

## Citation

If you use TrucoBench in your research, please cite:

```bibtex
@software{manzoli2026trucobench,
  title={TrucoBench: Evaluating LLM Strategic Reasoning Through Truco Paulista},
  author={William Manzoli},
  year={2026},
  url={https://github.com/ManzoliW/trucobench}
}
```

## License

MIT
