import { describe, expect, test } from "bun:test";
import { ActionType, Game } from "@trucobench/engine";
import { HeuristicAgent } from "../src/heuristic-agent.ts";
import { RandomAgent } from "../src/random-agent.ts";

describe("RandomAgent", () => {
	test("returns a legal action", async () => {
		const agent = new RandomAgent();
		const game = new Game(42);
		game.reset();
		const player = game.getCurrentPlayer()!;
		const obs = game.observe(player);

		const action = await agent.getAction(obs);
		const isLegal = obs.legalActions.some((a) => {
			if (a.type !== action.type) return false;
			if (a.type === ActionType.PLAY_CARD && action.type === ActionType.PLAY_CARD) {
				return a.cardIndex === action.cardIndex;
			}
			return true;
		});
		expect(isLegal).toBe(true);
	});

	test("can play a complete game", async () => {
		const agent0 = new RandomAgent();
		const agent1 = new RandomAgent();
		const game = new Game(42);
		game.reset();

		let steps = 0;
		while (game.state.winner === null && steps < 1000) {
			const player = game.getCurrentPlayer()!;
			const obs = game.observe(player);
			const agent = player === 0 ? agent0 : agent1;
			const action = await agent.getAction(obs);
			game.step(player, action);
			steps++;
		}

		expect(game.state.winner).not.toBeNull();
	});
});

describe("HeuristicAgent", () => {
	test("returns a legal action", async () => {
		const agent = new HeuristicAgent();
		const game = new Game(42);
		game.reset();
		const player = game.getCurrentPlayer()!;
		const obs = game.observe(player);

		const action = await agent.getAction(obs);
		const isLegal = obs.legalActions.some((a) => {
			if (a.type !== action.type) return false;
			if (a.type === ActionType.PLAY_CARD && action.type === ActionType.PLAY_CARD) {
				return a.cardIndex === action.cardIndex;
			}
			return true;
		});
		expect(isLegal).toBe(true);
	});

	test("can play a complete game", async () => {
		const agent0 = new HeuristicAgent();
		const agent1 = new HeuristicAgent();
		const game = new Game(99);
		game.reset();

		let steps = 0;
		while (game.state.winner === null && steps < 1000) {
			const player = game.getCurrentPlayer()!;
			const obs = game.observe(player);
			const agent = player === 0 ? agent0 : agent1;
			const action = await agent.getAction(obs);
			game.step(player, action);
			steps++;
		}

		expect(game.state.winner).not.toBeNull();
	});

	test("heuristic beats random most of the time", async () => {
		let heuristicWins = 0;
		const totalGames = 100;

		for (let i = 0; i < totalGames; i++) {
			const heuristic = new HeuristicAgent(i * 7);
			const random = new RandomAgent();
			const game = new Game(i);
			game.reset();

			// Alternate who is player 0
			const heuristicPlayer = i % 2 === 0 ? 0 : 1;

			let steps = 0;
			while (game.state.winner === null && steps < 1000) {
				const player = game.getCurrentPlayer()!;
				const obs = game.observe(player);
				const agent = player === heuristicPlayer ? heuristic : random;
				const action = await agent.getAction(obs);
				game.step(player, action);
				steps++;
			}

			if (game.state.winner === heuristicPlayer) {
				heuristicWins++;
			}
		}

		// Heuristic should beat random at least 55% of the time
		// (bluffing adds variance but heuristic still has strong strategic advantage)
		expect(heuristicWins).toBeGreaterThan(55);
	});

	test("responds to mão de onze", async () => {
		const agent = new HeuristicAgent();
		const game = new Game(42);
		game.reset();
		game.state.scores = [11, 5];
		game.state.currentRound = null;
		game.startNewRound();

		const obs = game.observe(0);
		expect(obs.maoDeOnze).toBe(true);

		const action = await agent.getAction(obs);
		expect(["ACCEPT", "FOLD"]).toContain(action.type);
	});

	test("responds to opponent escalation", async () => {
		const agent = new HeuristicAgent();
		const game = new Game(42);
		game.reset();

		const firstPlayer = game.getCurrentPlayer()!;
		game.step(firstPlayer, { type: ActionType.TRUCO });

		const responder = game.getCurrentPlayer()!;
		const obs = game.observe(responder);

		const action = await agent.getAction(obs);
		expect(["ACCEPT", "FOLD", "RAISE"]).toContain(action.type);
	});
});
