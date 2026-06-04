import { describe, expect, it } from "bun:test";
import { Game } from "../src/game";
import { cardStrength, getManilhaRank, isManilha } from "../src/deck";
import { ActionType, TrucoVariant } from "../src/types";

describe("Truco Mineiro", () => {
	it("should have fixed manilhas", () => {
		const vira: any = { rank: "K", suit: "ouros" }; // Vira shouldn't matter in Mineiro
		
		// Zap (4 of Clubs)
		expect(isManilha({ rank: "4", suit: "paus" }, vira, TrucoVariant.MINEIRO)).toBe(true);
		expect(cardStrength({ rank: "4", suit: "paus" }, vira, TrucoVariant.MINEIRO)).toBe(13);
		
		// 7 of Hearts
		expect(isManilha({ rank: "7", suit: "copas" }, vira, TrucoVariant.MINEIRO)).toBe(true);
		expect(cardStrength({ rank: "7", suit: "copas" }, vira, TrucoVariant.MINEIRO)).toBe(12);
		
		// Ace of Spades
		expect(isManilha({ rank: "A", suit: "espadas" }, vira, TrucoVariant.MINEIRO)).toBe(true);
		expect(cardStrength({ rank: "A", suit: "espadas" }, vira, TrucoVariant.MINEIRO)).toBe(11);
		
		// 7 of Diamonds
		expect(isManilha({ rank: "7", suit: "ouros" }, vira, TrucoVariant.MINEIRO)).toBe(true);
		expect(cardStrength({ rank: "7", suit: "ouros" }, vira, TrucoVariant.MINEIRO)).toBe(10);
		
		// Non-manilhas
		expect(isManilha({ rank: "3", suit: "paus" }, vira, TrucoVariant.MINEIRO)).toBe(false);
		expect(cardStrength({ rank: "3", suit: "paus" }, vira, TrucoVariant.MINEIRO)).toBe(9);
	});

	it("should follow 2-4-8-10-12 scoring", () => {
		const game = new Game({ variant: TrucoVariant.MINEIRO, trucoTiming: "anytime" });
		game.reset();
		const round = game.state.currentRound!;
		
		// Initial stake is 2
		expect(round.escalation.level).toBe("NORMAL");
		
		game.step(0, { type: ActionType.TRUCO }); // Requests 4
		game.step(1, { type: ActionType.FOLD });  // Folds, player 0 should get 2 points
		
		expect(game.state.scores[0]).toBe(2);
	});

	it("should handle Mão de Dez at 10 points", () => {
		const game = new Game({ variant: TrucoVariant.MINEIRO });
		game.state.scores = [10, 0];
		game.startNewRound();
		
		const obs = game.observe(0);
		expect(obs.maoDeOnze).toBe(true); // Engine uses same flag name for simplicity
		
		// If player 0 folds, opponent gets 2 points
		game.step(0, { type: ActionType.FOLD });
		expect(game.state.scores[1]).toBe(2);
	});

	it("should handle Mão de Dez acceptance (worth 4 points)", () => {
		const game = new Game({ variant: TrucoVariant.MINEIRO });
		game.state.scores = [10, 0];
		game.startNewRound();
		
		game.step(0, { type: ActionType.ACCEPT });
		const obs = game.observe(0);
		expect(obs.escalation.level).toBe("TRUCO"); // In Mineiro, TRUCO = 4 points
		
		// Play through the round to see score increase
		// (Assuming player 0 wins for simplicity, we'd need to control the deck)
	});
});
