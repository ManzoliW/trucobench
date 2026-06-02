import { compareCards } from "./deck.ts";
import type { Card, PlayerId, TrickResult, TrucoVariant } from "./types.ts";

/**
 * Resolve a single trick: two cards played, return winner or null (draw).
 */
export function resolveTrick(
	firstPlayer: PlayerId,
	firstCard: Card,
	secondCard: Card,
	vira: Card,
	variant: TrucoVariant = "PAULISTA",
): TrickResult {
	const cmp = compareCards(firstCard, secondCard, vira, variant);
	let winner: PlayerId | null;
	if (cmp > 0) {
		winner = firstPlayer;
	} else if (cmp < 0) {
		winner = otherPlayer(firstPlayer);
	} else {
		winner = null; // draw
	}

	const cards: [Card, Card] = [firstCard, secondCard];
	return { cards, firstPlayer, winner };
}

/**
 * Given completed tricks, determine the round winner.
 * Rules:
 * - Best of 3 tricks.
 * - If trick 1 draws: the winner of trick 2 wins the round.
 *   If trick 2 also draws: winner of trick 3. If all draw: first player of round wins.
 * - If trick 1 has a winner and trick 2 draws: trick 1 winner takes the round.
 * - If trick 1 has a winner and trick 2 has a different winner: trick 3 decides.
 *   If trick 3 draws: trick 1 winner takes the round.
 */
export function resolveRound(tricks: TrickResult[]): PlayerId | null {
	if (tricks.length === 0) return null;

	const t1 = tricks[0]!;

	// After trick 1, need at least trick 2 to decide
	if (tricks.length === 1) return null; // not enough tricks

	const t2 = tricks[1]!;

	// If someone wins both trick 1 and trick 2, they win the round (early exit)
	if (t1.winner !== null && t1.winner === t2.winner) {
		return t1.winner;
	}

	// Trick 1 drawn
	if (t1.winner === null) {
		// Trick 1 draw: whoever wins trick 2 wins the round
		if (t2.winner !== null) return t2.winner;
		// Both trick 1 and 2 drawn: need trick 3
		if (tricks.length < 3) return null;
		const t3 = tricks[2]!;
		if (t3.winner !== null) return t3.winner;
		// All three tricks drawn: first player of the round wins
		return t1.firstPlayer;
	}

	// Trick 1 has a winner
	if (t2.winner === null) {
		// Trick 2 drawn: trick 1 winner takes the round
		return t1.winner;
	}

	// Trick 1 and trick 2 have different winners — need trick 3
	if (tricks.length < 3) return null;
	const t3 = tricks[2]!;
	if (t3.winner === null) {
		// Trick 3 drawn: trick 1 winner takes the round
		return t1.winner;
	}
	return t3.winner;
}

/**
 * Can the round be decided early (before all 3 tricks)?
 * Returns the winner if decidable, null if more tricks needed.
 */
export function canDecideEarly(tricks: TrickResult[]): PlayerId | null {
	if (tricks.length < 2) return null;
	const t1 = tricks[0]!;
	const t2 = tricks[1]!;

	// Same player won both tricks
	if (t1.winner !== null && t1.winner === t2.winner) return t1.winner;

	// Trick 1 drawn, trick 2 has a winner
	if (t1.winner === null && t2.winner !== null) return t2.winner;

	// Trick 1 has a winner, trick 2 drawn
	if (t1.winner !== null && t2.winner === null) return t1.winner;

	return null;
}

export function otherPlayer(p: PlayerId): PlayerId {
	return p === 0 ? 1 : 0;
}
