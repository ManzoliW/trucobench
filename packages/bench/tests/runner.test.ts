import { describe, expect, test } from "bun:test";
import { HeuristicAgent, RandomAgent } from "@trucobench/agents";
import { type AgentFactory, playGame, playMatchup, runTournament } from "../src/runner.ts";
import type { TournamentConfig } from "../src/types.ts";

describe("playGame", () => {
	test("completes a game between two random agents", async () => {
		const record = await playGame(new RandomAgent(), new RandomAgent(), 42);
		expect(record.winner).toBeDefined();
		expect([0, 1]).toContain(record.winner);
		expect(record.scores[record.winner]).toBe(12);
		expect(record.rounds.length).toBeGreaterThan(0);
		expect(record.totalDurationMs).toBeGreaterThan(0);
	});

	test("seeded games with deterministic agents produce deterministic results", async () => {
		// HeuristicAgent is deterministic when given the same seed; RandomAgent uses Math.random so it's not
		const r1 = await playGame(new HeuristicAgent(1), new HeuristicAgent(2), 123);
		const r2 = await playGame(new HeuristicAgent(1), new HeuristicAgent(2), 123);
		expect(r1.winner).toBe(r2.winner);
		expect(r1.scores).toEqual(r2.scores);
		expect(r1.rounds.length).toBe(r2.rounds.length);
	});

	test("records round data", async () => {
		const record = await playGame(new RandomAgent(), new RandomAgent(), 42);
		for (const round of record.rounds) {
			expect(round.roundNumber).toBeGreaterThan(0);
			expect(round.actions.length).toBeGreaterThan(0);
		}
	});

	test("heuristic vs random completes", async () => {
		const record = await playGame(new HeuristicAgent(), new RandomAgent(), 42);
		expect(record.winner).toBeDefined();
		expect(record.agents).toEqual(["heuristic", "random"]);
	});
});

describe("playMatchup", () => {
	test("plays the right number of games", async () => {
		const result = await playMatchup(
			() => new RandomAgent(),
			() => new RandomAgent(),
			5,
			42,
			false,
		);
		expect(result.games.length).toBe(5);
		expect(result.wins[0] + result.wins[1]).toBe(5);
	});

	test("duplicate format doubles the games", async () => {
		const result = await playMatchup(
			() => new RandomAgent(),
			() => new HeuristicAgent(),
			5,
			42,
			true,
		);
		expect(result.games.length).toBe(10); // 5 original + 5 duplicate
	});

	test("duplicate games are marked", async () => {
		const result = await playMatchup(
			() => new RandomAgent(),
			() => new RandomAgent(),
			3,
			42,
			true,
		);
		const originals = result.games.filter((g) => !g.duplicate);
		const duplicates = result.games.filter((g) => g.duplicate);
		expect(originals.length).toBe(3);
		expect(duplicates.length).toBe(3);
		for (const dup of duplicates) {
			expect(dup.duplicateOf).toBeDefined();
		}
	});
});

describe("runTournament", () => {
	test("runs round-robin tournament", async () => {
		const agents: AgentFactory[] = [
			{ name: "random", create: () => new RandomAgent() },
			{ name: "heuristic", create: () => new HeuristicAgent() },
		];
		const config: TournamentConfig = {
			agents: ["random", "heuristic"],
			gamesPerMatchup: 5,
			duplicate: false,
			parallelism: 1,
			baseSeed: 42,
		};

		const result = await runTournament(agents, config);
		expect(result.matchups.length).toBe(1); // 2 agents = 1 matchup
		expect(result.totalGames).toBe(5);
	});

	test("three agents produce 3 matchups", async () => {
		const agents: AgentFactory[] = [
			{ name: "r1", create: () => new RandomAgent() },
			{ name: "r2", create: () => new RandomAgent() },
			{ name: "r3", create: () => new RandomAgent() },
		];
		const config: TournamentConfig = {
			agents: ["r1", "r2", "r3"],
			gamesPerMatchup: 2,
			duplicate: false,
			parallelism: 1,
			baseSeed: 42,
		};

		const result = await runTournament(agents, config);
		expect(result.matchups.length).toBe(3); // C(3,2) = 3
		expect(result.totalGames).toBe(6);
	});
});
