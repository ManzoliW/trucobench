# Contributing to TrucoBench

Thanks for your interest in contributing! Here's how to get started.

## Setup

```bash
bun install
bun test              # Run all tests (should pass)
bun run check         # Lint + format check
```

## Development

```bash
bun run packages/web dev     # Web UI on localhost:3000
bun test packages/engine     # Test a specific package
bun run check:fix            # Auto-fix lint/format
```

## Project Structure

```
packages/
├── engine/    Game logic (zero dependencies, pure TypeScript)
├── agents/    LLM agent adapters + heuristic/random baselines
├── bench/     Tournament runner, metrics, ELO ratings
├── cli/       CLI commands (run, tournament, report)
└── web/       Next.js web UI with real-time streaming
```

## Code Style

- **Formatter:** Biome (tabs, double quotes, semicolons, 100-char width)
- **Language:** TypeScript strict mode
- **Testing:** Bun's built-in test runner
- Run `bun run check` before submitting a PR

## Adding a New LLM Provider

1. Create an adapter in `packages/agents/src/providers/` implementing the `LLMProvider` interface
2. Register it in the CLI's provider map (`packages/cli/src/index.ts`)
3. Add tests in `packages/agents/tests/`

## Pull Requests

- Keep PRs focused — one feature or fix per PR
- Include tests for new functionality
- Run `bun test && bun run check` before submitting
- Write descriptive commit messages

## Reporting Issues

Open an issue on [GitHub](https://github.com/ManzoliW/trucobench/issues) with:
- Steps to reproduce
- Expected vs actual behavior
- Environment (OS, Bun version, Node version)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
