import { ActionType, type EscalationLevel, cardStrength, isManilha } from "@trucobench/engine";
import type { GameRecord, MatchupResult, TournamentResult } from "./types.ts";

export interface AgentMetrics {
	agent: string;
	gamesPlayed: number;
	wins: number;
	losses: number;
	winRate: number;
	/** Escalation metrics */
	trucoCalls: number;
	trucoAccepts: number;
	trucoFolds: number;
	trucoRaises: number;
	/** Bluff metrics */
	bluffAttempts: number; // truco calls where agent had no manilha
	bluffSuccesses: number; // opponent folded to our bluff
	bluffSuccessRate: number;
	bluffDetections: number; // times we didn't fold to opponent's bluff
	/** Escalation depth */
	escalationDepth: Record<EscalationLevel, number>;
	avgEscalationDepth: number;
	/** Card play */
	foldRate: number;
	/** Cost metrics (LLM only) */
	totalInputTokens: number;
	totalOutputTokens: number;
	totalLatencyMs: number;
	avgLatencyPerAction: number;
	parseFailures: number;
	parseFailureRate: number;
	fallbacks: number;
	/** Reasoning */
	avgReasoningLength: number;
}

export function computeAgentMetrics(agentName: string, tournament: TournamentResult): AgentMetrics {
	let gamesPlayed = 0;
	let wins = 0;
	let trucoCalls = 0;
	let trucoAccepts = 0;
	let trucoFolds = 0;
	let trucoRaises = 0;
	let bluffAttempts = 0;
	const bluffSuccesses = 0;
	const bluffDetections = 0;
	let folds = 0;
	let totalActions = 0;
	let totalInputTokens = 0;
	let totalOutputTokens = 0;
	let totalLatencyMs = 0;
	let parseFailures = 0;
	let fallbacks = 0;
	let totalReasoningLength = 0;
	let reasoningCount = 0;
	const escalationDepth: Record<string, number> = {
		NORMAL: 0,
		TRUCO: 0,
		SEIS: 0,
		NOVE: 0,
		DOZE: 0,
	};

	for (const matchup of tournament.matchups) {
		for (const game of matchup.games) {
			// Determine which player index this agent was
			const playerIdx = findPlayerIndex(agentName, game);
			if (playerIdx === null) continue;

			gamesPlayed++;
			if (game.winner === playerIdx) wins++;

			for (const round of game.rounds) {
				// Track escalation depth
				escalationDepth[round.finalEscalation] = (escalationDepth[round.finalEscalation] ?? 0) + 1;

				for (const action of round.actions) {
					if (action.player !== playerIdx) continue;
					totalActions++;

					// Escalation tracking
					if (action.action.type === ActionType.TRUCO) {
						trucoCalls++;
					} else if (action.action.type === ActionType.ACCEPT) {
						trucoAccepts++;
					} else if (action.action.type === ActionType.FOLD) {
						trucoFolds++;
						folds++;
					} else if (action.action.type === ActionType.RAISE) {
						trucoRaises++;
					}

					// LLM metrics
					if (action.inputTokens) totalInputTokens += action.inputTokens;
					if (action.outputTokens) totalOutputTokens += action.outputTokens;
					if (action.latencyMs) totalLatencyMs += action.latencyMs;
					if (action.fallback) fallbacks++;
					if (action.parseAttempts && action.parseAttempts > 1) parseFailures++;
					if (action.reasoning) {
						totalReasoningLength += action.reasoning.length;
						reasoningCount++;
					}
				}

				// Bluff analysis: truco calls by this agent where no manilha in hand
				// This is approximate — we'd need full hand state which is in the observation
				// For now, track escalation events
				for (const esc of round.escalationHistory) {
					if (esc.player === playerIdx && esc.action === "TRUCO") {
						// We count this as a bluff attempt (simplified)
						bluffAttempts++;
					}
				}
			}
		}
	}

	const losses = gamesPlayed - wins;

	return {
		agent: agentName,
		gamesPlayed,
		wins,
		losses,
		winRate: gamesPlayed > 0 ? wins / gamesPlayed : 0,
		trucoCalls,
		trucoAccepts,
		trucoFolds,
		trucoRaises,
		bluffAttempts,
		bluffSuccesses,
		bluffSuccessRate: bluffAttempts > 0 ? bluffSuccesses / bluffAttempts : 0,
		bluffDetections,
		escalationDepth: escalationDepth as Record<EscalationLevel, number>,
		avgEscalationDepth: 0, // computed separately
		foldRate: totalActions > 0 ? folds / totalActions : 0,
		totalInputTokens,
		totalOutputTokens,
		totalLatencyMs,
		avgLatencyPerAction: totalActions > 0 ? totalLatencyMs / totalActions : 0,
		parseFailures,
		parseFailureRate: totalActions > 0 ? parseFailures / totalActions : 0,
		fallbacks,
		avgReasoningLength: reasoningCount > 0 ? totalReasoningLength / reasoningCount : 0,
	};
}

function findPlayerIndex(agentName: string, game: GameRecord): 0 | 1 | null {
	if (game.agents[0] === agentName) return 0;
	if (game.agents[1] === agentName) return 1;
	return null;
}

export function computeMatchupStats(matchup: MatchupResult) {
	const total = matchup.games.length;
	return {
		agent0: matchup.agent0,
		agent1: matchup.agent1,
		totalGames: total,
		agent0Wins: matchup.wins[0],
		agent1Wins: matchup.wins[1],
		agent0WinRate: total > 0 ? matchup.wins[0] / total : 0,
		agent1WinRate: total > 0 ? matchup.wins[1] / total : 0,
	};
}
