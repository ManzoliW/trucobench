/**
 * Sinais (signals) — a core part of 4-player Truco Paulista.
 *
 * In real Truco, partners communicate through subtle physical gestures:
 * - Zap (paus manilha): wink
 * - Copas manilha: pucker lips
 * - Espadas manilha: raise eyebrow
 * - Ouros manilha: show card corner
 * - 3: raise 3 fingers subtly
 * - 2: raise 2 fingers
 * - A (Ace): slight nod
 * - Nothing good: subtle head shake
 *
 * Each signal has a chance of being noticed by the partner AND
 * a chance of being intercepted by opponents.
 */

import { getManilhaRank, isManilha } from "./deck.ts";
import type { Card } from "./types.ts";

/* ── Types ─────────────────────────────────────────── */

export type SignalType =
	| "ZAP" // Has paus manilha (strongest card)
	| "COPAS" // Has copas manilha
	| "ESPADAS" // Has espadas manilha
	| "OUROS" // Has ouros manilha (weakest manilha)
	| "THREE" // Has a 3
	| "TWO" // Has a 2
	| "ACE" // Has an Ace
	| "NOTHING"; // Weak hand, nothing noteworthy

/** A signal attempt from one player */
export interface Signal {
	type: SignalType;
	fromSeat: number; // 0-3
}

/** The outcome of a single signal attempt */
export interface SignalResult {
	signal: Signal;
	partnerReceived: boolean;
	interceptedBy: number[]; // opponent seats that caught it
}

/** All signal results for one round */
export interface RoundSignals {
	results: SignalResult[];
}

export interface SignalConfig {
	enabled: boolean;
	/** Probability that partner notices the signal (0-1). Default 0.70 */
	partnerDetectionRate: number;
	/** Probability that each opponent notices the signal (0-1). Default 0.20 */
	opponentInterceptionRate: number;
	/** Max signals per player per round. Default 1 */
	maxSignalsPerPlayer: number;
}

export const DEFAULT_SIGNAL_CONFIG: SignalConfig = {
	enabled: true,
	partnerDetectionRate: 0.7,
	opponentInterceptionRate: 0.2,
	maxSignalsPerPlayer: 1,
};

/* ── Signal priority (higher = more important to signal) ── */

const SIGNAL_PRIORITY: Record<SignalType, number> = {
	ZAP: 12,
	COPAS: 11,
	ESPADAS: 10,
	OUROS: 9,
	THREE: 8,
	TWO: 7,
	ACE: 6,
	NOTHING: 0,
};

/* ── Generation ────────────────────────────────────── */

/**
 * Determine what signals a player would naturally try to send
 * based on their hand. Returns signals sorted by priority (most
 * important first), limited to `maxSignals`.
 */
export function generateSignals(hand: Card[], vira: Card, seat: number, maxSignals = 1): Signal[] {
	const candidates: Signal[] = [];

	for (const card of hand) {
		if (isManilha(card, vira)) {
			if (card.suit === "paus") candidates.push({ type: "ZAP", fromSeat: seat });
			else if (card.suit === "copas") candidates.push({ type: "COPAS", fromSeat: seat });
			else if (card.suit === "espadas") candidates.push({ type: "ESPADAS", fromSeat: seat });
			else if (card.suit === "ouros") candidates.push({ type: "OUROS", fromSeat: seat });
		} else {
			if (card.rank === "3") candidates.push({ type: "THREE", fromSeat: seat });
			else if (card.rank === "2") candidates.push({ type: "TWO", fromSeat: seat });
			else if (card.rank === "A") candidates.push({ type: "ACE", fromSeat: seat });
		}
	}

	if (candidates.length === 0) {
		candidates.push({ type: "NOTHING", fromSeat: seat });
	}

	// Sort by priority descending, take top N
	candidates.sort((a, b) => SIGNAL_PRIORITY[b.type] - SIGNAL_PRIORITY[a.type]);
	return candidates.slice(0, maxSignals);
}

/* ── Simple seeded RNG ─────────────────────────────── */

interface RNG {
	next(): number; // returns [0, 1)
}

function createRNG(seed: number): RNG {
	let state = seed & 0x7fffffff;
	if (state === 0) state = 1;
	return {
		next() {
			state = (state * 1664525 + 1013904223) & 0x7fffffff;
			return state / 0x7fffffff;
		},
	};
}

/* ── Processing ────────────────────────────────────── */

/**
 * Get the partner seat for a given seat (teams: 0+2 vs 1+3).
 */
function partnerSeat(seat: number): number {
	return (seat + 2) % 4;
}

/**
 * Get the two opponent seats for a given seat.
 */
function opponentSeats(seat: number): [number, number] {
	return [(seat + 1) % 4, (seat + 3) % 4];
}

/**
 * Process all signal attempts for a round.
 * Each player generates signals, then dice are rolled to determine
 * who receives/intercepts them.
 */
export function processRoundSignals(
	hands: [Card[], Card[], Card[], Card[]],
	vira: Card,
	config: SignalConfig,
	seed: number,
): RoundSignals {
	if (!config.enabled) return { results: [] };

	const rng = createRNG(seed);
	const results: SignalResult[] = [];

	for (let seat = 0; seat < 4; seat++) {
		const signals = generateSignals(hands[seat]!, vira, seat, config.maxSignalsPerPlayer);

		for (const signal of signals) {
			// Roll for partner detection
			const partnerReceived = rng.next() < config.partnerDetectionRate;

			// Roll for each opponent independently
			const [opp1, opp2] = opponentSeats(seat);
			const interceptedBy: number[] = [];
			if (rng.next() < config.opponentInterceptionRate) interceptedBy.push(opp1);
			if (rng.next() < config.opponentInterceptionRate) interceptedBy.push(opp2);

			results.push({ signal, partnerReceived, interceptedBy });
		}
	}

	return { results };
}

/**
 * Process a single manual signal attempt (for human players).
 * Returns the result with reception/interception outcomes.
 * The sender does NOT learn whether the partner received it.
 */
export function processSingleSignal(
	signal: Signal,
	config: SignalConfig,
	seed: number,
): SignalResult {
	if (!config.enabled) return { signal, partnerReceived: false, interceptedBy: [] };

	const rng = createRNG(seed);
	const partnerReceived = rng.next() < config.partnerDetectionRate;
	const [opp1, opp2] = opponentSeats(signal.fromSeat);
	const interceptedBy: number[] = [];
	if (rng.next() < config.opponentInterceptionRate) interceptedBy.push(opp1);
	if (rng.next() < config.opponentInterceptionRate) interceptedBy.push(opp2);

	return { signal, partnerReceived, interceptedBy };
}

/**
 * Get signals visible to a specific seat from the round's signal results.
 * A player can see:
 * 1. Partner signals that were successfully received
 * 2. Opponent signals that this player intercepted
 */
export function getVisibleSignals(
	roundSignals: RoundSignals,
	seat: number,
): { partnerSignals: Signal[]; interceptedSignals: Signal[] } {
	const partner = partnerSeat(seat);
	const [opp1, opp2] = opponentSeats(seat);

	const partnerSignals: Signal[] = [];
	const interceptedSignals: Signal[] = [];

	for (const result of roundSignals.results) {
		// Partner's signal that I received
		if (result.signal.fromSeat === partner && result.partnerReceived) {
			partnerSignals.push(result.signal);
		}
		// Opponent's signal that I intercepted
		if (
			(result.signal.fromSeat === opp1 || result.signal.fromSeat === opp2) &&
			result.interceptedBy.includes(seat)
		) {
			interceptedSignals.push(result.signal);
		}
	}

	return { partnerSignals, interceptedSignals };
}
