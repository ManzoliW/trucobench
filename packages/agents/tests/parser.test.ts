import { describe, expect, test } from "bun:test";
import { Game } from "@trucobench/engine";
import { buildRetryPrompt, parseResponse, weakestLegalAction } from "../src/parser.ts";

function makeObservation(seed = 42) {
	const game = new Game(seed);
	game.reset();
	const player = game.getCurrentPlayer()!;
	return game.observe(player);
}

describe("parseResponse", () => {
	test("parses valid JSON response", () => {
		const obs = makeObservation();
		const raw = JSON.stringify({
			reasoning: "Playing my strongest card",
			action: "PLAY_CARD",
			card_index: 0,
		});
		const result = parseResponse(raw, obs);
		expect(result.action).not.toBeNull();
		expect(result.action!.type).toBe("PLAY_CARD");
		expect(result.reasoning).toBe("Playing my strongest card");
		expect(result.error).toBeNull();
	});

	test("parses JSON from markdown code block", () => {
		const obs = makeObservation();
		const raw = '```json\n{"reasoning": "test", "action": "PLAY_CARD", "card_index": 1}\n```';
		const result = parseResponse(raw, obs);
		expect(result.action).not.toBeNull();
		expect(result.action!.type).toBe("PLAY_CARD");
	});

	test("parses JSON embedded in text", () => {
		const obs = makeObservation();
		const raw =
			'Here is my action:\n{"reasoning": "good move", "action": "PLAY_CARD", "card_index": 2}\nThanks!';
		const result = parseResponse(raw, obs);
		expect(result.action).not.toBeNull();
	});

	test("returns null for garbage input", () => {
		const obs = makeObservation();
		const result = parseResponse("I think I should play a card", obs);
		expect(result.action).toBeNull();
		expect(result.error).not.toBeNull();
	});

	test("returns null for invalid action type", () => {
		const obs = makeObservation();
		const raw = JSON.stringify({
			reasoning: "test",
			action: "INVALID_ACTION",
			card_index: 0,
		});
		const result = parseResponse(raw, obs);
		expect(result.action).toBeNull();
		expect(result.error).toContain("Invalid action");
	});

	test("returns null for out-of-range card index", () => {
		const obs = makeObservation();
		const raw = JSON.stringify({
			reasoning: "test",
			action: "PLAY_CARD",
			card_index: 99,
		});
		const result = parseResponse(raw, obs);
		expect(result.action).toBeNull();
	});

	test("handles TRUCO action", () => {
		const obs = makeObservation();
		// Make sure TRUCO is a legal action
		if (obs.legalActions.some((a) => a.type === "TRUCO")) {
			const raw = JSON.stringify({ reasoning: "bluff", action: "TRUCO" });
			const result = parseResponse(raw, obs);
			expect(result.action).not.toBeNull();
			expect(result.action!.type).toBe("TRUCO");
		}
	});

	test("case insensitive action parsing", () => {
		const obs = makeObservation();
		const raw = JSON.stringify({
			reasoning: "test",
			action: "play_card",
			card_index: 0,
		});
		const result = parseResponse(raw, obs);
		expect(result.action).not.toBeNull();
	});
});

describe("weakestLegalAction", () => {
	test("prefers FOLD when available", () => {
		const game = new Game({ seed: 42, trucoTiming: "anytime" });
		game.reset();
		const player = game.getCurrentPlayer()!;
		game.step(player, { type: "TRUCO" });

		const opponent = game.getCurrentPlayer()!;
		const obs = game.observe(opponent);
		const action = weakestLegalAction(obs);
		expect(action.type).toBe("FOLD");
	});

	test("picks weakest card when no FOLD available", () => {
		const obs = makeObservation();
		const action = weakestLegalAction(obs);
		expect(action.type).toBe("PLAY_CARD");
	});
});

describe("buildRetryPrompt", () => {
	test("attempt 1 asks for valid JSON", () => {
		const obs = makeObservation();
		const prompt = buildRetryPrompt(1, "bad json", obs);
		expect(prompt).toContain("valid JSON");
	});

	test("attempt 2+ lists legal actions", () => {
		const obs = makeObservation();
		const prompt = buildRetryPrompt(2, "invalid action", obs);
		expect(prompt).toContain("PLAY_CARD");
	});
});
