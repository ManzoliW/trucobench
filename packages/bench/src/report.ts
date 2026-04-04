import { type CostMetrics, computeCost } from "./cost.ts";
import { type EloRating, computeElo } from "./elo.ts";
import { type AgentMetrics, computeAgentMetrics, computeMatchupStats } from "./metrics.ts";
import { type TraceAnalysis, analyzeTraces } from "./traces.ts";
import type { TournamentResult } from "./types.ts";

export interface FullReport {
	tournament: TournamentResult;
	elo: EloRating[];
	agentMetrics: AgentMetrics[];
	traceAnalysis: TraceAnalysis[];
	costMetrics: CostMetrics[];
	matchupStats: ReturnType<typeof computeMatchupStats>[];
}

export function generateReport(tournament: TournamentResult): FullReport {
	const agentNames = getUniqueAgents(tournament);
	const elo = computeElo(tournament);
	const agentMetrics = agentNames.map((a) => computeAgentMetrics(a, tournament));
	const traceAnalysis = agentNames.map((a) => analyzeTraces(a, tournament));
	const costMetrics = agentNames.map((a) => computeCost(a, tournament));
	const matchupStats = tournament.matchups.map(computeMatchupStats);

	return { tournament, elo, agentMetrics, traceAnalysis, costMetrics, matchupStats };
}

function getUniqueAgents(tournament: TournamentResult): string[] {
	const agents = new Set<string>();
	for (const matchup of tournament.matchups) {
		agents.add(matchup.agent0);
		agents.add(matchup.agent1);
	}
	return [...agents].sort();
}

export function reportToJSON(report: FullReport): string {
	return JSON.stringify(report, null, 2);
}

export function reportToCSV(report: FullReport): string {
	const headers = [
		"agent",
		"elo",
		"games",
		"wins",
		"losses",
		"win_rate",
		"truco_calls",
		"fold_rate",
		"parse_failure_rate",
		"total_cost_usd",
		"cost_per_hand",
		"avg_latency_ms",
		"avg_reasoning_length",
	];

	const rows = report.agentMetrics.map((m) => {
		const elo = report.elo.find((e) => e.agent === m.agent);
		const cost = report.costMetrics.find((c) => c.agent === m.agent);
		return [
			m.agent,
			elo?.rating ?? 1500,
			m.gamesPlayed,
			m.wins,
			m.losses,
			m.winRate.toFixed(4),
			m.trucoCalls,
			m.foldRate.toFixed(4),
			m.parseFailureRate.toFixed(4),
			cost?.totalCostUSD.toFixed(4) ?? "0",
			cost?.costPerHand.toFixed(6) ?? "0",
			m.avgLatencyPerAction.toFixed(0),
			m.avgReasoningLength.toFixed(0),
		].join(",");
	});

	return [headers.join(","), ...rows].join("\n");
}

export function reportToMarkdown(report: FullReport): string {
	const lines: string[] = [];

	lines.push("# TrucoBench Results\n");
	lines.push(`Tournament: ${report.tournament.totalGames} games\n`);
	lines.push(`Period: ${report.tournament.startTime} to ${report.tournament.endTime}\n`);

	// ELO Leaderboard
	lines.push("## ELO Leaderboard\n");
	lines.push("| Rank | Agent | ELO | Games |");
	lines.push("|------|-------|-----|-------|");
	for (let i = 0; i < report.elo.length; i++) {
		const e = report.elo[i]!;
		lines.push(`| ${i + 1} | ${e.agent} | ${e.rating} | ${e.gamesPlayed} |`);
	}
	lines.push("");

	// Win Rate Matrix
	lines.push("## Head-to-Head Win Rates\n");
	lines.push("| Matchup | Agent 0 WR | Agent 1 WR | Games |");
	lines.push("|---------|-----------|-----------|-------|");
	for (const m of report.matchupStats) {
		lines.push(
			`| ${m.agent0} vs ${m.agent1} | ${(m.agent0WinRate * 100).toFixed(1)}% | ${(m.agent1WinRate * 100).toFixed(1)}% | ${m.totalGames} |`,
		);
	}
	lines.push("");

	// Agent Metrics
	lines.push("## Agent Metrics\n");
	lines.push("| Agent | Win Rate | Truco Calls | Fold Rate | Parse Fail | Avg Latency |");
	lines.push("|-------|----------|-------------|-----------|------------|-------------|");
	for (const m of report.agentMetrics) {
		lines.push(
			`| ${m.agent} | ${(m.winRate * 100).toFixed(1)}% | ${m.trucoCalls} | ${(m.foldRate * 100).toFixed(1)}% | ${(m.parseFailureRate * 100).toFixed(1)}% | ${m.avgLatencyPerAction.toFixed(0)}ms |`,
		);
	}
	lines.push("");

	// Cost
	const hasCosts = report.costMetrics.some((c) => c.totalCostUSD > 0);
	if (hasCosts) {
		lines.push("## Cost Analysis\n");
		lines.push("| Agent | Total Cost | Cost/Hand | Input Tokens | Output Tokens |");
		lines.push("|-------|-----------|-----------|--------------|---------------|");
		for (const c of report.costMetrics) {
			lines.push(
				`| ${c.agent} | $${c.totalCostUSD.toFixed(4)} | $${c.costPerHand.toFixed(6)} | ${c.totalInputTokens} | ${c.totalOutputTokens} |`,
			);
		}
		lines.push("");
	}

	return lines.join("\n");
}
