import { describe, expect, test } from "bun:test";
import { isManilha } from "../src/deck.ts";
import { Game } from "../src/game.ts";
import { ActionType } from "../src/types.ts";
import type { Action, PlayerId } from "../src/types.ts";

describe("Game", () => {
	test("reset initializes a valid game state", () => {
		const game = new Game({ seed: 42 });
		const state = game.reset();
		expect(state.scores).toEqual([0, 0]);
		expect(state.winner).toBeNull();
		expect(state.roundNumber).toBe(1);
		expect(state.currentRound).not.toBeNull();
		expect(state.currentRound!.hands[0].length).toBe(3);
		expect(state.currentRound!.hands[1].length).toBe(3);
	});

	test("observe returns correct player view", () => {
		const game = new Game({ seed: 42 });
		game.reset();
		const obs0 = game.observe(0);
		const obs1 = game.observe(1);

		expect(obs0.playerId).toBe(0);
		expect(obs1.playerId).toBe(1);
		expect(obs0.hand.length).toBe(3);
		expect(obs1.hand.length).toBe(3);
		expect(obs0.opponentCardCount).toBe(3);

		// Players should NOT see each other's hands
		expect(obs0.hand).not.toEqual(obs1.hand);
	});

	test("observation does not leak opponent hand", () => {
		const game = new Game({ seed: 42 });
		game.reset();
		const round = game.state.currentRound!;
		const obs0 = game.observe(0);

		// The observation should contain player 0's hand, not player 1's
		expect(obs0.hand).toEqual(round.hands[0]);

		// Verify the observation object has no reference to opponent's hand
		const obsStr = JSON.stringify(obs0);
		for (const card of round.hands[1]) {
			// The opponent's cards shouldn't appear in the observation
			// unless they happen to coincide with the player's own cards
			const isInOwnHand = round.hands[0].some((c) => c.rank === card.rank && c.suit === card.suit);
			if (!isInOwnHand) {
				expect(obsStr).not.toContain(`"rank":"${card.rank}","suit":"${card.suit}"`);
			}
		}
	});

	test("getLegalActions returns card plays for active player", () => {
		const game = new Game({ seed: 42, trucoTiming: "anytime" });
		game.reset();
		const player = game.getCurrentPlayer()!;
		const actions = game.getLegalActions(player);

		// Should have 3 PLAY_CARD + TRUCO (with "anytime" timing)
		const cardPlays = actions.filter((a) => a.type === ActionType.PLAY_CARD);
		expect(cardPlays.length).toBe(3);

		// Should be able to call TRUCO with "anytime" timing
		const truco = actions.find((a) => a.type === ActionType.TRUCO);
		expect(truco).toBeDefined();
	});

	test("non-active player has no legal actions", () => {
		const game = new Game({ seed: 42 });
		game.reset();
		const active = game.getCurrentPlayer()!;
		const other = active === 0 ? 1 : 0;
		expect(game.getLegalActions(other)).toEqual([]);
	});

	test("playing a card removes it from hand", () => {
		const game = new Game({ seed: 42 });
		game.reset();
		const player = game.getCurrentPlayer()!;
		const handBefore = game.state.currentRound!.hands[player].length;

		game.step(player, { type: ActionType.PLAY_CARD, cardIndex: 0 });

		expect(game.state.currentRound!.hands[player].length).toBe(handBefore - 1);
	});

	test("full trick resolves correctly", () => {
		const game = new Game({ seed: 42 });
		game.reset();

		const p1 = game.getCurrentPlayer()!;
		const r1 = game.step(p1, { type: ActionType.PLAY_CARD, cardIndex: 0 });
		expect(r1.roundDone).toBe(false);

		const p2 = game.getCurrentPlayer()!;
		expect(p2).not.toBe(p1);
		const r2 = game.step(p2, { type: ActionType.PLAY_CARD, cardIndex: 0 });

		// After two cards, a trick should be resolved
		expect(game.state.currentRound!.tricks.length).toBeGreaterThanOrEqual(1);
	});

	test("calling TRUCO creates a pending escalation", () => {
		const game = new Game({ seed: 42, trucoTiming: "anytime" });
		game.reset();

		const player = game.getCurrentPlayer()!;
		game.step(player, { type: ActionType.TRUCO });

		const esc = game.state.currentRound!.escalation;
		expect(esc.pendingRequest).toBe("TRUCO");
		expect(esc.requestedBy).toBe(player);

		// Opponent must respond
		const other = game.getCurrentPlayer()!;
		expect(other).not.toBe(player);
		const actions = game.getLegalActions(other);
		expect(actions.map((a) => a.type)).toContain(ActionType.ACCEPT);
		expect(actions.map((a) => a.type)).toContain(ActionType.FOLD);
		expect(actions.map((a) => a.type)).toContain(ActionType.RAISE);
	});

	test("accepting TRUCO increases stake to 3", () => {
		const game = new Game({ seed: 42, trucoTiming: "anytime" });
		game.reset();

		const player = game.getCurrentPlayer()!;
		game.step(player, { type: ActionType.TRUCO });

		const other = game.getCurrentPlayer()!;
		game.step(other, { type: ActionType.ACCEPT });

		expect(game.state.currentRound!.escalation.level).toBe("TRUCO");
	});

	test("folding gives points to the caller", () => {
		const game = new Game({ seed: 42, trucoTiming: "anytime" });
		game.reset();

		const player = game.getCurrentPlayer()!;
		game.step(player, { type: ActionType.TRUCO });

		const other = game.getCurrentPlayer()!;
		const result = game.step(other, { type: ActionType.FOLD });

		expect(result.roundDone).toBe(true);
		expect(result.roundWinner).toBe(player);
		expect(result.scores[player]).toBe(1); // NORMAL points (pre-escalation)
	});

	test("raise counter-escalates", () => {
		const game = new Game({ seed: 42, trucoTiming: "anytime" });
		game.reset();

		const p0 = game.getCurrentPlayer()!;
		game.step(p0, { type: ActionType.TRUCO });

		const p1 = game.getCurrentPlayer()!;
		game.step(p1, { type: ActionType.RAISE });

		const esc = game.state.currentRound!.escalation;
		expect(esc.level).toBe("TRUCO"); // accepted TRUCO
		expect(esc.pendingRequest).toBe("SEIS"); // raised to SEIS
	});

	test("illegal action throws", () => {
		const game = new Game({ seed: 42 });
		game.reset();

		const player = game.getCurrentPlayer()!;
		const other: PlayerId = player === 0 ? 1 : 0;

		// Other player trying to act out of turn
		expect(() => {
			game.step(other, { type: ActionType.PLAY_CARD, cardIndex: 0 });
		}).toThrow();
	});

	test("cannot escalate after already escalating (same player)", () => {
		const game = new Game({ seed: 42, trucoTiming: "anytime" });
		game.reset();

		const p0 = game.getCurrentPlayer()!;
		game.step(p0, { type: ActionType.TRUCO });

		const p1 = game.getCurrentPlayer()!;
		game.step(p1, { type: ActionType.ACCEPT });

		// p0 was the last to escalate, so p0 cannot escalate again
		// We need to play to p0's turn first
		const afterAccept = game.getCurrentPlayer()!;
		if (afterAccept === p0) {
			const actions = game.getLegalActions(p0);
			expect(actions.map((a) => a.type)).not.toContain(ActionType.TRUCO);
		}
	});

	test("complete round with card play gives correct points", () => {
		const game = new Game({ seed: 100 });
		game.reset();

		// Play a full round (up to 3 tricks)
		let roundDone = false;
		while (!roundDone) {
			const player = game.getCurrentPlayer()!;
			const actions = game.getLegalActions(player);
			// Pick first card play action
			const cardPlay = actions.find((a) => a.type === ActionType.PLAY_CARD);
			if (cardPlay) {
				const result = game.step(player, cardPlay);
				roundDone = result.roundDone;
				if (roundDone) {
					// At NORMAL level, winner gets 1 point
					const totalPoints = result.scores[0] + result.scores[1];
					expect(totalPoints).toBe(1);
				}
			}
		}
	});

	test("game completes when a player reaches 12 points", () => {
		const game = new Game({ seed: 1 });
		game.reset();

		let gameOver = false;
		let steps = 0;
		const maxSteps = 10000;

		while (!gameOver && steps < maxSteps) {
			const player = game.getCurrentPlayer();
			if (player === null) break;

			const actions = game.getLegalActions(player);
			if (actions.length === 0) break;

			// Always play first card, never truco (faster games for testing)
			const cardPlay = actions.find((a) => a.type === ActionType.PLAY_CARD);
			const action = cardPlay ?? actions[0]!;
			const result = game.step(player, action);
			gameOver = result.done;
			steps++;
		}

		expect(gameOver).toBe(true);
		expect(game.state.winner).not.toBeNull();
		const winnerScore = game.state.scores[game.state.winner!];
		expect(winnerScore).toBe(12);
	});

	test("seeded games are deterministic", () => {
		function playGame(seed: number): { winner: PlayerId; scores: [number, number] } {
			const game = new Game({ seed });
			game.reset();

			while (game.state.winner === null) {
				const player = game.getCurrentPlayer()!;
				const actions = game.getLegalActions(player);
				const cardPlay = actions.find((a) => a.type === ActionType.PLAY_CARD);
				const action = cardPlay ?? actions[0]!;
				game.step(player, action);
			}

			return { winner: game.state.winner, scores: [...game.state.scores] as [number, number] };
		}

		const r1 = playGame(555);
		const r2 = playGame(555);
		expect(r1.winner).toBe(r2.winner);
		expect(r1.scores).toEqual(r2.scores);
	});
});

describe("mão de onze", () => {
	function setupMaoDeOnze(score0: number, score1: number, seed = 42): Game {
		const game = new Game({ seed });
		game.reset();
		game.state.scores = [score0, score1];
		game.state.currentRound = null;
		game.startNewRound();
		return game;
	}

	test("at 11 points, player must decide to play or fold", () => {
		const game = setupMaoDeOnze(11, 5);
		const player = game.getCurrentPlayer()!;
		expect(player).toBe(0);

		const actions = game.getLegalActions(0);
		expect(actions.length).toBe(2);
		expect(actions.map((a) => a.type)).toContain(ActionType.ACCEPT);
		expect(actions.map((a) => a.type)).toContain(ActionType.FOLD);
	});

	test("opponent has no actions during mão de onze decision", () => {
		const game = setupMaoDeOnze(11, 5);
		expect(game.getLegalActions(1)).toEqual([]);
	});

	test("folding mão de onze gives opponent 1 point", () => {
		const game = setupMaoDeOnze(11, 5);
		const result = game.step(0, { type: ActionType.FOLD });
		expect(result.roundDone).toBe(true);
		expect(result.scores[1]).toBe(6); // 5 + 1
	});

	test("accepting mão de onze sets stakes to 3", () => {
		const game = setupMaoDeOnze(11, 5);
		game.step(0, { type: ActionType.ACCEPT });
		expect(game.state.currentRound!.escalation.level).toBe("TRUCO");
	});

	test("mão de onze player cannot escalate", () => {
		const game = setupMaoDeOnze(11, 5);
		game.step(0, { type: ActionType.ACCEPT });

		// Play until player 0's turn to check they can't call TRUCO
		const player = game.getCurrentPlayer()!;
		const actions = game.getLegalActions(player);
		if (player === 0) {
			expect(actions.map((a) => a.type)).not.toContain(ActionType.TRUCO);
		}
	});

	test("observation shows maoDeOnze flag for the deciding player", () => {
		const game = setupMaoDeOnze(11, 5);
		const obs0 = game.observe(0);
		const obs1 = game.observe(1);
		expect(obs0.maoDeOnze).toBe(true);
		expect(obs1.maoDeOnze).toBe(false);
	});

	test("mão de ferro when both at 11", () => {
		const game = setupMaoDeOnze(11, 11);
		// No decision needed — auto-decided
		expect(game.state.currentRound!.maoDeOnze.decided).toBe(true);
		expect(game.state.currentRound!.maoDeferro).toBe(true);

		// Should go straight to card play
		const player = game.getCurrentPlayer()!;
		const actions = game.getLegalActions(player);
		const cardPlays = actions.filter((a) => a.type === ActionType.PLAY_CARD);
		expect(cardPlays.length).toBe(3);

		// Cannot escalate in mão de ferro
		expect(actions.map((a) => a.type)).not.toContain(ActionType.TRUCO);
	});
});

describe("performance", () => {
	test("10,000 random games complete in under 5 seconds", () => {
		const start = performance.now();
		const gameCount = 10_000;

		for (let i = 0; i < gameCount; i++) {
			const game = new Game(i);
			game.reset();

			let steps = 0;
			while (game.state.winner === null && steps < 500) {
				const player = game.getCurrentPlayer();
				if (player === null) break;

				const actions = game.getLegalActions(player);
				if (actions.length === 0) break;

				// Pick a random-ish action deterministically
				const action = actions[steps % actions.length]!;
				game.step(player, action);
				steps++;
			}
		}

		const elapsed = performance.now() - start;
		expect(elapsed).toBeLessThan(5000);
	});
});
