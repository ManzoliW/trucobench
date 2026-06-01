import type { GameStats } from "./game-stats";

export interface GameResult {
	id: string;
	timestamp: number;
	players: { name: string; model: string; type: string }[];
	scores: [number, number];
	winner: number;
	mode: "2p" | "4p";
	stats: GameStats;
}

const STORAGE_KEY = "trucobench-history";
const MAX_HISTORY = 100;

export function saveGameResult(result: GameResult): void {
	if (typeof window === "undefined") return;
	try {
		const history = getGameHistory();
		history.unshift(result);
		if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
		localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
	} catch {}
}

export function getGameHistory(): GameResult[] {
	if (typeof window === "undefined") return [];
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		return JSON.parse(raw) as GameResult[];
	} catch {
		return [];
	}
}

export interface ModelRecord {
	name: string;
	wins: number;
	losses: number;
}

/** Compute aggregate stats from game history */
export function computeAggregateStats(history: GameResult[]): {
	gamesPlayed: number;
	wins: number;
	losses: number;
	modelRecords: ModelRecord[];
} {
	let wins = 0;
	let losses = 0;
	const modelMap = new Map<string, { wins: number; losses: number }>();

	for (const game of history) {
		// Find if human played
		const humanIdx = game.players.findIndex((p) => p.type === "human");
		if (humanIdx < 0) continue; // spectator game, skip

		const humanTeam = game.mode === "4p" ? (humanIdx === 0 || humanIdx === 2 ? 0 : 1) : humanIdx;
		const won = game.winner === humanTeam;
		if (won) wins++;
		else losses++;

		// Track opponent models
		for (const p of game.players) {
			if (p.type === "human") continue;
			const name = p.name || p.model || "AI";
			const rec = modelMap.get(name) ?? { wins: 0, losses: 0 };
			// From model's perspective: if human won, model lost
			if (won) rec.losses++;
			else rec.wins++;
			modelMap.set(name, rec);
		}
	}

	const modelRecords: ModelRecord[] = [...modelMap.entries()]
		.map(([name, rec]) => ({ name, wins: rec.wins, losses: rec.losses }))
		.sort((a, b) => b.wins / (b.wins + b.losses || 1) - a.wins / (a.wins + a.losses || 1));

	return { gamesPlayed: history.length, wins, losses, modelRecords };
}

/** Encode a GameResult into a compact base64url string for share URLs */
export function encodeResultForShare(result: GameResult): string {
	const compact = {
		p: result.players.map((p) => ({ n: p.name, m: p.model, t: p.type })),
		s: result.scores,
		w: result.winner,
		m: result.mode,
		r: result.stats.rounds,
		d: result.stats.duration,
		tc: result.stats.trucosCalled,
		ta: result.stats.trucosAccepted,
		f: result.stats.folds,
		cp: result.stats.cardsPlayed,
	};
	return btoa(JSON.stringify(compact)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decode a share URL string back into a GameResult */
export function decodeResultFromShare(encoded: string | null): GameResult | null {
	if (!encoded) return null;
	try {
		const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
		const json = atob(padded);
		const c = JSON.parse(json);
		return {
			id: "",
			timestamp: 0,
			players: (c.p as { n: string; m: string; t: string }[]).map((p) => ({
				name: p.n,
				model: p.m,
				type: p.t,
			})),
			scores: c.s,
			winner: c.w,
			mode: c.m,
			stats: {
				rounds: c.r,
				duration: c.d,
				trucosCalled: c.tc,
				trucosAccepted: c.ta,
				folds: c.f,
				cardsPlayed: c.cp,
			},
		};
	} catch {
		return null;
	}
}
