# Unified Seat Picker — Inline Key Entry

> Merge model selection and API key entry into a single flow inside the seat picker.

## Problem

Three disconnected concepts: provider mode, model selection, API keys. Users pick a model, don't know they need a key, game fails with 500 error. The "API Keys" section is buried below the table.

## Solution

When you tap a model in the seat picker that needs an API key, the row expands inline to ask for the key. Once entered, it's saved and reused.

## Seat Picker Flow

### Local agents (top section)
- Sit here / Heuristic Bot / Random Bot
- No key needed. Tap and done.

### LLM Models (middle section)
Each row shows: provider badge + model name + key status (green dot or empty)

**Tap a model WITHOUT a saved key:**
1. Row expands to show a password input + "Save & select" button
2. User pastes key
3. Key saved to localStorage, model selected, picker closes

**Tap a model WITH a saved key:**
1. Model selected, picker closes immediately

### Invite a friend (bottom, grayed out)
- Unchanged

## What gets removed
- Provider mode pills (Direct/OpenRouter/etc.) from settings row
- Separate "API Keys" collapsible section below table
- Provider picker modal
- `providerMode` state (default to "direct" always)

## What stays in settings row
- Timer, Prompt mode, Temperature

## Key storage
- localStorage under `trucobench-keys`
- Keyed by provider name: `{ openai: "sk-...", anthropic: "sk-ant-...", ... }`
- One key per provider, shared across all models from that provider

## Decision Log

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Key entry inline in seat picker | Ask for key at the moment of selection, not elsewhere |
| 2 | Remove provider mode pills | Direct APIs handles everything, concept was confusing |
| 3 | Remove separate API Keys section | Redundant once picker handles keys |
| 4 | Green dot = key saved | Instant visual feedback on model readiness |
