import type { GameRecord, TournamentResult } from "./types.ts";

export const ReasoningPattern = {
	CARD_STRENGTH: "CARD_STRENGTH",
	SCORE_AWARENESS: "SCORE_AWARENESS",
	OPPONENT_MODELING: "OPPONENT_MODELING",
	BLUFF_REASONING: "BLUFF_REASONING",
	ESCALATION_LOGIC: "ESCALATION_LOGIC",
	POSITIONAL: "POSITIONAL",
} as const;

export type ReasoningPattern = (typeof ReasoningPattern)[keyof typeof ReasoningPattern];

const PATTERN_KEYWORDS: Record<ReasoningPattern, RegExp[]> = {
	CARD_STRENGTH: [
		/manilha/i,
		/zap/i,
		/strong|weak|high|low/i,
		/forte|fraca|alta|baixa/i,
		/card strength|card value/i,
		/beat|win the trick/i,
	],
	SCORE_AWARENESS: [
		/score|point/i,
		/placar|ponto/i,
		/\b1[12]\b.*point/i,
		/close to winning/i,
		/need \d+ (more )?point/i,
		/mão de onze|mao de onze/i,
	],
	OPPONENT_MODELING: [
		/opponent|they|their/i,
		/oponente|ele|adversário/i,
		/likely has|probably hold/i,
		/expect.*to play/i,
		/opponent('s)? (hand|card|strategy)/i,
	],
	BLUFF_REASONING: [
		/bluff/i,
		/blefe/i,
		/scare|intimidate|pressure/i,
		/fold.*(them|opponent)/i,
		/pretend|fake/i,
		/they might fold/i,
	],
	ESCALATION_LOGIC: [
		/truco|seis|nove|doze/i,
		/raise|escalat/i,
		/accept|fold/i,
		/worth the risk/i,
		/stakes|points at stake/i,
	],
	POSITIONAL: [
		/first (to )?play/i,
		/second (to )?play/i,
		/trick (1|2|3|one|two|three)/i,
		/already won.*trick/i,
		/need to win this trick/i,
		/position/i,
	],
};

export function classifyReasoning(reasoning: string): ReasoningPattern[] {
	if (!reasoning || reasoning.trim().length === 0) return [];

	const patterns: ReasoningPattern[] = [];
	for (const [pattern, keywords] of Object.entries(PATTERN_KEYWORDS)) {
		if (keywords.some((re) => re.test(reasoning))) {
			patterns.push(pattern as ReasoningPattern);
		}
	}
	return patterns;
}

export interface TraceAnalysis {
	agent: string;
	totalReasonings: number;
	avgReasoningLength: number;
	patternCounts: Record<ReasoningPattern, number>;
	patternRates: Record<ReasoningPattern, number>;
	/** Cases where reasoning identified the correct play but action was wrong */
	knowingDoingGap: number;
}

export function analyzeTraces(agentName: string, tournament: TournamentResult): TraceAnalysis {
	let totalReasonings = 0;
	let totalLength = 0;
	const patternCounts: Record<string, number> = {};
	for (const p of Object.keys(ReasoningPattern)) {
		patternCounts[p] = 0;
	}

	for (const matchup of tournament.matchups) {
		for (const game of matchup.games) {
			const playerIdx = game.agents[0] === agentName ? 0 : game.agents[1] === agentName ? 1 : null;
			if (playerIdx === null) continue;

			for (const round of game.rounds) {
				for (const action of round.actions) {
					if (action.player !== playerIdx) continue;
					if (!action.reasoning) continue;

					totalReasonings++;
					totalLength += action.reasoning.length;

					const patterns = classifyReasoning(action.reasoning);
					for (const p of patterns) {
						patternCounts[p] = (patternCounts[p] ?? 0) + 1;
					}
				}
			}
		}
	}

	const patternRates: Record<string, number> = {};
	for (const p of Object.keys(ReasoningPattern)) {
		patternRates[p] = totalReasonings > 0 ? (patternCounts[p] ?? 0) / totalReasonings : 0;
	}

	return {
		agent: agentName,
		totalReasonings,
		avgReasoningLength: totalReasonings > 0 ? totalLength / totalReasonings : 0,
		patternCounts: patternCounts as Record<ReasoningPattern, number>,
		patternRates: patternRates as Record<ReasoningPattern, number>,
		knowingDoingGap: 0, // requires deeper analysis
	};
}
