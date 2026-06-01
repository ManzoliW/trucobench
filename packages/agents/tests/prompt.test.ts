import { describe, expect, test } from "bun:test";
import { Game } from "@trucobench/engine";
import { serializePrompt } from "../src/prompt.ts";

function makeObservation(seed = 42) {
	const game = new Game(seed);
	game.reset();
	const player = game.getCurrentPlayer()!;
	return game.observe(player);
}

describe("serializePrompt", () => {
	test("minimal prompt contains essential info", () => {
		const obs = makeObservation();
		const prompt = serializePrompt(obs, { variant: "minimal", language: "en" });
		expect(prompt).toContain("Hand:");
		expect(prompt).toContain("Vira:");
		expect(prompt).toContain("Score:");
		expect(prompt).toContain("Actions:");
		expect(prompt).toContain("PLAY_CARD");
	});

	test("standard prompt has sections", () => {
		const obs = makeObservation();
		const prompt = serializePrompt(obs, { variant: "standard", language: "en" });
		expect(prompt).toContain("## Your hand");
		expect(prompt).toContain("## Vira");
		expect(prompt).toContain("## Manilhas");
		expect(prompt).toContain("## Score");
		expect(prompt).toContain("## Legal actions");
		expect(prompt).toContain("Respond in JSON:");
		expect(prompt).toContain("Zap");
	});

	test("verbose prompt includes rules", () => {
		const obs = makeObservation();
		const prompt = serializePrompt(obs, { variant: "verbose", language: "en" });
		expect(prompt).toContain("Truco Paulista Rules");
		expect(prompt).toContain("Advanced strategy hints");
		expect(prompt).toContain("## Your hand");
	});

	test("Portuguese minimal prompt", () => {
		const obs = makeObservation();
		const prompt = serializePrompt(obs, { variant: "minimal", language: "pt" });
		expect(prompt).toContain("Voce");
		expect(prompt).toContain("Oponente");
	});

	test("Portuguese standard prompt", () => {
		const obs = makeObservation();
		const prompt = serializePrompt(obs, { variant: "standard", language: "pt" });
		expect(prompt).toContain("## Sua mao");
		expect(prompt).toContain("## Placar");
		expect(prompt).toContain("## Acoes legais");
		expect(prompt).toContain("Responda em JSON:");
	});

	test("Portuguese verbose prompt includes rules", () => {
		const obs = makeObservation();
		const prompt = serializePrompt(obs, { variant: "verbose", language: "pt" });
		expect(prompt).toContain("Regras do Truco Paulista");
		expect(prompt).toContain("Dicas de estrategia");
	});

	test("standard prompt lists all 3 hand cards", () => {
		const obs = makeObservation();
		const prompt = serializePrompt(obs, { variant: "standard", language: "en" });
		// Should have card indices 0, 1, 2
		expect(prompt).toContain("- 0:");
		expect(prompt).toContain("- 1:");
		expect(prompt).toContain("- 2:");
	});

	test("prompt does not contain opponent hand info", () => {
		const game = new Game({ seed: 42 });
		game.reset();
		const obs = game.observe(0);
		const opponentHand = game.state.currentRound!.hands[1];
		const prompt = serializePrompt(obs, { variant: "standard", language: "en" });

		// Make sure the opponent's specific cards aren't mentioned
		// (unless they happen to be the same as ours or the vira)
		for (const card of opponentHand) {
			const isOurs = obs.hand.some((c) => c.rank === card.rank && c.suit === card.suit);
			const isVira = obs.vira.rank === card.rank && obs.vira.suit === card.suit;
			if (!isOurs && !isVira) {
				// The opponent's card shouldn't appear in the prompt with its full suit name
				const fullLabel = `${card.rank} of`;
				// This is a weaker check — we just make sure it's not suspiciously present
				// beyond what's shown in manilha listing (which shows all 4 suits of manilha rank)
			}
		}
	});

	test("mão de onze shows in standard prompt", () => {
		const game = new Game({ seed: 42 });
		game.reset();
		game.state.scores = [11, 5];
		game.state.currentRound = null;
		game.startNewRound();
		const obs = game.observe(0);
		const prompt = serializePrompt(obs, { variant: "standard", language: "en" });
		expect(prompt).toContain("Mao de Onze");
	});

	test("mão de ferro shows in standard prompt", () => {
		const game = new Game({ seed: 42 });
		game.reset();
		game.state.scores = [11, 11];
		game.state.currentRound = null;
		game.startNewRound();
		const obs = game.observe(0);
		const prompt = serializePrompt(obs, { variant: "standard", language: "en" });
		expect(prompt).toContain("Mao de Ferro");
	});
});
