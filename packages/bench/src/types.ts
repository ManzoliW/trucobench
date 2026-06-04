import type { Action, Card, EscalationLevel, PlayerId, TrickResult } from "@trucobench/engine";

export interface GameRecord {
	id: string;
	seed: number;
	agents: [string, string]; // agent names
	winner: PlayerId;
	scores: [number, number];
	rounds: RoundRecord[];
	totalDurationMs: number;
	duplicate: boolean; // whether this is the hand-swapped duplicate
	duplicateOf?: string; // id of the original game if this is a duplicate
}

export interface RoundRecord {
	roundNumber: number;
	vira: Card;
	tricks: TrickResult[];
	escalationHistory: EscalationEvent[];
	winner: PlayerId | null;
	points: number;
	finalEscalation: EscalationLevel;
	actions: ActionRecord[];
}

export interface ActionRecord {
	player: PlayerId;
	action: Action;
	reasoning?: string;
	raw?: string;
	parseAttempts?: number;
	fallback?: boolean;
	inputTokens?: number;
	outputTokens?: number;
	latencyMs?: number;
	/** Snapshot of player's hand at time of action (for bluff analysis) */
	hand?: Card[];
	/** Vira card for this round (needed to compute manilha status) */
	vira?: Card;
}

export interface EscalationEvent {
	player: PlayerId;
	action: "TRUCO" | "ACCEPT" | "RAISE" | "FOLD";
	level: EscalationLevel;
}

export interface MatchupResult {
	agent0: string;
	agent1: string;
	games: GameRecord[];
	wins: [number, number];
	draws: number;
}

export interface TournamentConfig {
	agents: string[];
	gamesPerMatchup: number;
	seeds?: number[];
	duplicate: boolean; // hand-swapping
	parallelism: number;
	baseSeed: number;
}

export interface TournamentResult {
	config: TournamentConfig;
	matchups: MatchupResult[];
	startTime: string;
	endTime: string;
	totalGames: number;
}
