import { type Card, type Rank, Ranks, type Suit, Suits, TrucoVariant } from "./types.ts";

function createDeck(): Card[] {
	const cards: Card[] = [];
	for (const suit of Suits) {
		for (const rank of Ranks) {
			cards.push({ suit, rank });
		}
	}
	return cards;
}

/**
 * Seeded PRNG (xorshift32) for deterministic shuffles.
 */
function xorshift32(seed: number): () => number {
	let state = seed | 0 || 1; // ensure non-zero
	return () => {
		state ^= state << 13;
		state ^= state >> 17;
		state ^= state << 5;
		return (state >>> 0) / 0x100000000;
	};
}

export function shuffleDeck(seed?: number): Card[] {
	const deck = createDeck();
	const rng = seed !== undefined ? xorshift32(seed) : Math.random;
	// Fisher-Yates shuffle
	for (let i = deck.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[deck[i], deck[j]] = [deck[j]!, deck[i]!];
	}
	return deck;
}

export function deal(deck: Card[]): { hands: [Card[], Card[]]; vira: Card; remaining: Card[] } {
	// Deal 3 cards to each player, then flip vira
	const hand0 = deck.slice(0, 3);
	const hand1 = deck.slice(3, 6);
	const vira = deck[6]!;
	const remaining = deck.slice(7);
	return { hands: [hand0, hand1], vira, remaining };
}

/** Base rank strength (no manilha). Index = strength. */
const RANK_STRENGTH: Record<Rank, number> = {
	"4": 0,
	"5": 1,
	"6": 2,
	"7": 3,
	Q: 4,
	J: 5,
	K: 6,
	A: 7,
	"2": 8,
	"3": 9,
};

/** Manilha suit strength. Higher = stronger. */
const MANILHA_SUIT_STRENGTH: Record<Suit, number> = {
	ouros: 0,
	espadas: 1,
	copas: 2,
	paus: 3, // zap — strongest
};

/**
 * Returns the rank that is the manilha rank given the vira card.
 * Manilha rank = vira rank + 1 in the rank cycle.
 * Rank cycle: 4,5,6,7,Q,J,K,A,2,3 (wraps: 3→4)
 */
export function getManilhaRank(vira: Card): Rank {
	const viraIndex = Ranks.indexOf(vira.rank);
	const manilhaIndex = (viraIndex + 1) % Ranks.length;
	return Ranks[manilhaIndex]!;
}

export function isManilha(card: Card, vira: Card, variant: TrucoVariant = "PAULISTA"): boolean {
	if (variant === "PAULISTA") {
		return card.rank === getManilhaRank(vira);
	}
	// MINEIRO: Fixed manilhas
	// 4 of Clubs, 7 of Hearts, Ace of Spades, 7 of Diamonds
	if (card.rank === "4" && card.suit === "paus") return true;
	if (card.rank === "7" && card.suit === "copas") return true;
	if (card.rank === "A" && card.suit === "espadas") return true;
	if (card.rank === "7" && card.suit === "ouros") return true;
	return false;
}

/**
 * Returns a numeric strength for a card given the vira.
 * Manilhas get strength 10-13 (by suit/fixed rank), regular cards get 0-9 (by rank).
 */
export function cardStrength(card: Card, vira: Card, variant: TrucoVariant = "PAULISTA"): number {
	if (variant === "PAULISTA") {
		if (isManilha(card, vira, "PAULISTA")) {
			return 10 + MANILHA_SUIT_STRENGTH[card.suit];
		}
		return RANK_STRENGTH[card.rank];
	}

	// MINEIRO
	if (card.rank === "4" && card.suit === "paus") return 13; // Zap
	if (card.rank === "7" && card.suit === "copas") return 12;
	if (card.rank === "A" && card.suit === "espadas") return 11;
	if (card.rank === "7" && card.suit === "ouros") return 10;

	return RANK_STRENGTH[card.rank];
}

/**
 * Compare two cards. Returns:
 *  > 0 if a wins
 *  < 0 if b wins
 *  0 if draw
 */
export function compareCards(a: Card, b: Card, vira: Card, variant: TrucoVariant = "PAULISTA"): number {
	return cardStrength(a, vira, variant) - cardStrength(b, vira, variant);
}

export function cardToString(card: Card): string {
	const suitSymbol: Record<Suit, string> = {
		ouros: "\u2666",
		espadas: "\u2660",
		copas: "\u2665",
		paus: "\u2663",
	};
	return `${card.rank}${suitSymbol[card.suit]}`;
}

export function cardsEqual(a: Card, b: Card): boolean {
	return a.rank === b.rank && a.suit === b.suit;
}
