import { describe, expect, test } from "bun:test";
import { HeuristicAgent, RandomAgent } from "@trucobench/agents";
import { computeElo } from "../src/elo.ts";
import { computeAgentMetrics, computeMatchupStats } from "../src/metrics.ts";
import { generateReport, reportToCSV, reportToMarkdown } from "../src/report.ts";
import { type AgentFactory, runTournament } from "../src/runner.ts";
import { classifyReasoning } from "../src/traces.ts";
import type { TournamentConfig } from "../src/types.ts";

async function makeTournament() {
	const agents: AgentFactory[] = [
		{ name: "random", create: () => new RandomAgent() },
		{ name: "heuristic", create: () => new HeuristicAgent() },
	];
	const config: TournamentConfig = {
		agents: ["random", "heuristic"],
		gamesPerMatchup: 50,
		duplicate: false,
		parallelism: 1,
		baseSeed: 42,
	};
	return runTournament(agents, config);
}

describe("computeAgentMetrics", () => {
	test("computes metrics for each agent", async () => {
		const tournament = await makeTournament();
		const randomMetrics = computeAgentMetrics("random", tournament);
		const heuristicMetrics = computeAgentMetrics("heuristic", tournament);

		expect(randomMetrics.gamesPlayed).toBe(50);
		expect(heuristicMetrics.gamesPlayed).toBe(50);
		expect(randomMetrics.wins + heuristicMetrics.wins).toBe(50);
		expect(randomMetrics.winRate + heuristicMetrics.winRate).toBeCloseTo(1.0, 5);
	});

	test("heuristic has higher win rate than random", async () => {
		const tournament = await makeTournament();
		const randomMetrics = computeAgentMetrics("random", tournament);
		const heuristicMetrics = computeAgentMetrics("heuristic", tournament);

		expect(heuristicMetrics.winRate).toBeGreaterThan(randomMetrics.winRate);
	});
});

describe("computeElo", () => {
	test("computes ELO ratings", async () => {
		const tournament = await makeTournament();
		const elo = computeElo(tournament);

		expect(elo.length).toBe(2);
		// Heuristic should have higher ELO
		const heuristicElo = elo.find((e) => e.agent === "heuristic")!;
		const randomElo = elo.find((e) => e.agent === "random")!;
		expect(heuristicElo.rating).toBeGreaterThan(randomElo.rating);
	});

	test("ELO ratings sum is approximately constant", async () => {
		const tournament = await makeTournament();
		const elo = computeElo(tournament);
		const totalRating = elo.reduce((sum, e) => sum + e.rating, 0);
		// Should be close to 3000 (2 * 1500 initial)
		expect(totalRating).toBeCloseTo(3000, -1);
	});
});

describe("classifyReasoning", () => {
	test("detects card strength reasoning", () => {
		const patterns = classifyReasoning("I have a manilha which is a strong card");
		expect(patterns).toContain("CARD_STRENGTH");
	});

	test("detects score awareness", () => {
		const patterns = classifyReasoning("The score is 10-8, I need 2 more points to win");
		expect(patterns).toContain("SCORE_AWARENESS");
	});

	test("detects opponent modeling", () => {
		const patterns = classifyReasoning("My opponent likely has a weak hand based on their play");
		expect(patterns).toContain("OPPONENT_MODELING");
	});

	test("detects bluff reasoning", () => {
		const patterns = classifyReasoning("I'll bluff with truco to scare them into folding");
		expect(patterns).toContain("BLUFF_REASONING");
	});

	test("detects escalation logic", () => {
		const patterns = classifyReasoning("The stakes are 3 points, worth the risk to raise to seis");
		expect(patterns).toContain("ESCALATION_LOGIC");
	});

	test("detects positional reasoning", () => {
		const patterns = classifyReasoning("I already won trick 1, so I can play conservatively");
		expect(patterns).toContain("POSITIONAL");
	});

	test("returns empty for no reasoning", () => {
		expect(classifyReasoning("")).toEqual([]);
		expect(classifyReasoning("   ")).toEqual([]);
	});

	test("can detect multiple patterns", () => {
		const patterns = classifyReasoning(
			"I have a manilha (strong card), score is 10-5, opponent probably has weak cards. I'll bluff with truco.",
		);
		expect(patterns.length).toBeGreaterThanOrEqual(3);
	});
});

describe("report generation", () => {
	test("generates full report", async () => {
		const tournament = await makeTournament();
		const report = generateReport(tournament);

		expect(report.elo.length).toBe(2);
		expect(report.agentMetrics.length).toBe(2);
		expect(report.matchupStats.length).toBe(1);
	});

	test("markdown report has expected sections", async () => {
		const tournament = await makeTournament();
		const report = generateReport(tournament);
		const md = reportToMarkdown(report);

		expect(md).toContain("# TrucoBench Results");
		expect(md).toContain("## ELO Leaderboard");
		expect(md).toContain("## Head-to-Head Win Rates");
		expect(md).toContain("## Agent Metrics");
	});

	test("CSV report has correct column count", async () => {
		const tournament = await makeTournament();
		const report = generateReport(tournament);
		const csv = reportToCSV(report);

		const lines = csv.split("\n");
		const headerCols = lines[0]!.split(",").length;
		for (const line of lines.slice(1)) {
			expect(line.split(",").length).toBe(headerCols);
		}
	});

	test("matchup stats are correct", async () => {
		const tournament = await makeTournament();
		const report = generateReport(tournament);

		for (const m of report.matchupStats) {
			expect(m.agent0WinRate + m.agent1WinRate).toBeCloseTo(1.0, 5);
			expect(m.totalGames).toBe(50);
		}
	});
});
