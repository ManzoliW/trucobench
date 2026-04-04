import type { TournamentResult } from "./types.ts";

// Prices per 1M tokens (approximate, as of 2026)
const TOKEN_PRICES: Record<string, { input: number; output: number }> = {
	"gpt-4o": { input: 2.5, output: 10 },
	"gpt-4o-mini": { input: 0.15, output: 0.6 },
	"claude-sonnet-4-6-20260327": { input: 3, output: 15 },
	"claude-haiku-4-5-20251001": { input: 0.8, output: 4 },
	"gemini-2.5-pro": { input: 1.25, output: 10 },
	"gemini-2.5-flash": { input: 0.15, output: 0.6 },
	"deepseek-reasoner": { input: 0.55, output: 2.19 },
};

export interface CostMetrics {
	agent: string;
	model: string;
	totalInputTokens: number;
	totalOutputTokens: number;
	totalCostUSD: number;
	totalHands: number;
	costPerHand: number;
	avgLatencyMs: number;
}

export function computeCost(agentName: string, tournament: TournamentResult): CostMetrics {
	let totalInputTokens = 0;
	let totalOutputTokens = 0;
	let totalLatencyMs = 0;
	let totalActions = 0;
	let totalHands = 0;

	for (const matchup of tournament.matchups) {
		for (const game of matchup.games) {
			const playerIdx = game.agents[0] === agentName ? 0 : game.agents[1] === agentName ? 1 : null;
			if (playerIdx === null) continue;

			totalHands++;
			for (const round of game.rounds) {
				for (const action of round.actions) {
					if (action.player !== playerIdx) continue;
					if (action.inputTokens) totalInputTokens += action.inputTokens;
					if (action.outputTokens) totalOutputTokens += action.outputTokens;
					if (action.latencyMs) totalLatencyMs += action.latencyMs;
					totalActions++;
				}
			}
		}
	}

	// Try to match model from agent name (format: "provider/model")
	const model = agentName.includes("/") ? (agentName.split("/")[1] ?? "") : "";
	const prices = findPrices(model);

	const inputCost = (totalInputTokens / 1_000_000) * prices.input;
	const outputCost = (totalOutputTokens / 1_000_000) * prices.output;
	const totalCostUSD = inputCost + outputCost;

	return {
		agent: agentName,
		model,
		totalInputTokens,
		totalOutputTokens,
		totalCostUSD,
		totalHands,
		costPerHand: totalHands > 0 ? totalCostUSD / totalHands : 0,
		avgLatencyMs: totalActions > 0 ? totalLatencyMs / totalActions : 0,
	};
}

function findPrices(model: string): { input: number; output: number } {
	for (const [key, prices] of Object.entries(TOKEN_PRICES)) {
		if (model.includes(key)) return prices;
	}
	return { input: 0, output: 0 }; // free/local models
}
