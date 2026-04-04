import { serializePrompt } from "@trucobench/agents";
/**
 * Generate example prompts for the paper appendix.
 * Run: bun run experiments/generate-prompt-examples.ts
 */
import { Game } from "@trucobench/engine";

const game = new Game(42);
game.reset();

// Play one card to create some state
const p1 = game.getCurrentPlayer()!;
game.step(p1, { type: "PLAY_CARD", cardIndex: 0 });

// Now observe from player 1's perspective (they need to play)
const p2 = game.getCurrentPlayer()!;
const obs = game.observe(p2);

console.log("=== MINIMAL PROMPT (English) ===\n");
console.log(serializePrompt(obs, { variant: "minimal", language: "en" }));

console.log("\n\n=== STANDARD PROMPT (English) ===\n");
console.log(serializePrompt(obs, { variant: "standard", language: "en" }));

console.log("\n\n=== STANDARD PROMPT (Portuguese) ===\n");
console.log(serializePrompt(obs, { variant: "standard", language: "pt" }));
