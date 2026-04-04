import type { TournamentResult } from "./types.ts";

const DEFAULT_K = 32;
const INITIAL_RATING = 1500;

export interface EloRating {
	agent: string;
	rating: number;
	gamesPlayed: number;
}

export function computeElo(tournament: TournamentResult, k = DEFAULT_K): EloRating[] {
	const ratings = new Map<string, number>();

	// Initialize all agents
	for (const matchup of tournament.matchups) {
		if (!ratings.has(matchup.agent0)) ratings.set(matchup.agent0, INITIAL_RATING);
		if (!ratings.has(matchup.agent1)) ratings.set(matchup.agent1, INITIAL_RATING);
	}

	const gamesPlayed = new Map<string, number>();
	for (const agent of ratings.keys()) {
		gamesPlayed.set(agent, 0);
	}

	// Process each game chronologically
	for (const matchup of tournament.matchups) {
		for (const game of matchup.games) {
			const a0 = game.agents[0];
			const a1 = game.agents[1];
			const ra = ratings.get(a0)!;
			const rb = ratings.get(a1)!;

			const ea = expectedScore(ra, rb);
			const eb = expectedScore(rb, ra);

			const sa = game.winner === 0 ? 1 : 0;
			const sb = game.winner === 1 ? 1 : 0;

			ratings.set(a0, ra + k * (sa - ea));
			ratings.set(a1, rb + k * (sb - eb));

			gamesPlayed.set(a0, (gamesPlayed.get(a0) ?? 0) + 1);
			gamesPlayed.set(a1, (gamesPlayed.get(a1) ?? 0) + 1);
		}
	}

	const result: EloRating[] = [];
	for (const [agent, rating] of ratings) {
		result.push({
			agent,
			rating: Math.round(rating),
			gamesPlayed: gamesPlayed.get(agent) ?? 0,
		});
	}

	return result.sort((a, b) => b.rating - a.rating);
}

function expectedScore(ratingA: number, ratingB: number): number {
	return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}
