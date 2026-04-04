import { describe, expect, test } from "bun:test";
import {
	cardStrength,
	cardToString,
	cardsEqual,
	compareCards,
	deal,
	getManilhaRank,
	isManilha,
	shuffleDeck,
} from "../src/deck.ts";
import type { Card, Rank, Suit } from "../src/types.ts";
import { Ranks } from "../src/types.ts";

function card(rank: Rank, suit: Suit): Card {
	return { rank, suit };
}

describe("deck", () => {
	test("creates a 40-card deck", () => {
		const deck = shuffleDeck(42);
		expect(deck.length).toBe(40);
	});

	test("no 8s, 9s, or 10s in deck", () => {
		const deck = shuffleDeck(42);
		for (const c of deck) {
			expect(["8", "9", "10"]).not.toContain(c.rank);
		}
	});

	test("contains all expected ranks and suits", () => {
		const deck = shuffleDeck(42);
		const suits = new Set(deck.map((c) => c.suit));
		const ranks = new Set(deck.map((c) => c.rank));
		expect(suits.size).toBe(4);
		expect(ranks.size).toBe(10);
		expect(suits).toEqual(new Set(["ouros", "espadas", "copas", "paus"]));
	});

	test("seeded shuffle is deterministic", () => {
		const a = shuffleDeck(123);
		const b = shuffleDeck(123);
		expect(a).toEqual(b);
	});

	test("different seeds produce different orders", () => {
		const a = shuffleDeck(1);
		const b = shuffleDeck(2);
		const sameOrder = a.every((c, i) => cardsEqual(c, b[i]!));
		expect(sameOrder).toBe(false);
	});
});

describe("deal", () => {
	test("deals 3 cards to each player and a vira", () => {
		const deck = shuffleDeck(42);
		const { hands, vira, remaining } = deal(deck);
		expect(hands[0].length).toBe(3);
		expect(hands[1].length).toBe(3);
		expect(vira).toBeDefined();
		expect(remaining.length).toBe(33); // 40 - 6 - 1
	});

	test("no cards overlap between hands and vira", () => {
		const deck = shuffleDeck(42);
		const { hands, vira } = deal(deck);
		const all = [...hands[0], ...hands[1], vira];
		const unique = new Set(all.map((c) => `${c.rank}-${c.suit}`));
		expect(unique.size).toBe(7);
	});
});

describe("manilha", () => {
	test("manilha rank is vira + 1 in rank cycle", () => {
		expect(getManilhaRank(card("4", "ouros"))).toBe("5");
		expect(getManilhaRank(card("7", "copas"))).toBe("Q");
		expect(getManilhaRank(card("A", "paus"))).toBe("2");
		expect(getManilhaRank(card("3", "espadas"))).toBe("4"); // wraps around
	});

	test("vira rank cycle covers all transitions", () => {
		const expected: Rank[] = ["5", "6", "7", "Q", "J", "K", "A", "2", "3", "4"];
		for (let i = 0; i < Ranks.length; i++) {
			const vira = card(Ranks[i]!, "ouros");
			expect(getManilhaRank(vira)).toBe(expected[i]!);
		}
	});

	test("isManilha correctly identifies manilhas", () => {
		const vira = card("6", "copas"); // manilha rank = 7
		expect(isManilha(card("7", "ouros"), vira)).toBe(true);
		expect(isManilha(card("7", "paus"), vira)).toBe(true);
		expect(isManilha(card("6", "copas"), vira)).toBe(false); // vira itself is NOT a manilha
		expect(isManilha(card("3", "paus"), vira)).toBe(false);
	});

	test("vira card itself is never a manilha", () => {
		const vira = card("Q", "espadas"); // manilha rank = J
		expect(isManilha(vira, vira)).toBe(false);
	});
});

describe("card strength", () => {
	test("standard rank ordering without manilhas", () => {
		const vira = card("4", "ouros"); // manilha = 5
		// Test non-manilha ordering: 4 < 6 < 7 < Q < J < K < A < 2 < 3
		// (skip 5 since it's the manilha here)
		expect(cardStrength(card("4", "copas"), vira)).toBeLessThan(
			cardStrength(card("6", "copas"), vira),
		);
		expect(cardStrength(card("6", "copas"), vira)).toBeLessThan(
			cardStrength(card("7", "copas"), vira),
		);
		expect(cardStrength(card("7", "copas"), vira)).toBeLessThan(
			cardStrength(card("Q", "copas"), vira),
		);
		expect(cardStrength(card("Q", "copas"), vira)).toBeLessThan(
			cardStrength(card("J", "copas"), vira),
		);
		expect(cardStrength(card("J", "copas"), vira)).toBeLessThan(
			cardStrength(card("K", "copas"), vira),
		);
		expect(cardStrength(card("K", "copas"), vira)).toBeLessThan(
			cardStrength(card("A", "copas"), vira),
		);
		expect(cardStrength(card("A", "copas"), vira)).toBeLessThan(
			cardStrength(card("2", "copas"), vira),
		);
		expect(cardStrength(card("2", "copas"), vira)).toBeLessThan(
			cardStrength(card("3", "copas"), vira),
		);
	});

	test("manilhas are stronger than any non-manilha", () => {
		const vira = card("6", "copas"); // manilha = 7
		const weakestManilha = cardStrength(card("7", "ouros"), vira);
		const strongestRegular = cardStrength(card("3", "paus"), vira);
		expect(weakestManilha).toBeGreaterThan(strongestRegular);
	});

	test("manilha suit ordering: ouros < espadas < copas < paus", () => {
		const vira = card("6", "copas"); // manilha = 7
		const ouros = cardStrength(card("7", "ouros"), vira);
		const espadas = cardStrength(card("7", "espadas"), vira);
		const copas = cardStrength(card("7", "copas"), vira);
		const paus = cardStrength(card("7", "paus"), vira);
		expect(ouros).toBeLessThan(espadas);
		expect(espadas).toBeLessThan(copas);
		expect(copas).toBeLessThan(paus);
	});

	test("zap (paus manilha) is the strongest card", () => {
		const vira = card("6", "copas"); // manilha = 7
		const zap = cardStrength(card("7", "paus"), vira);
		// Check against every non-manilha 3
		expect(zap).toBe(13); // 10 + 3 (paus suit strength)
	});

	test("same rank, same suit = equal strength (non-manilha draw)", () => {
		const vira = card("4", "ouros");
		// Two 3s of the same suit would be the same card, so test same rank different suit
		const a = cardStrength(card("3", "copas"), vira);
		const b = cardStrength(card("3", "espadas"), vira);
		// Non-manilhas of the same rank have the same strength (draws)
		expect(a).toBe(b);
	});
});

describe("compareCards", () => {
	test("higher rank beats lower", () => {
		const vira = card("4", "ouros");
		expect(compareCards(card("3", "copas"), card("K", "copas"), vira)).toBeGreaterThan(0);
	});

	test("same non-manilha rank is a draw", () => {
		const vira = card("4", "ouros");
		expect(compareCards(card("K", "copas"), card("K", "espadas"), vira)).toBe(0);
	});

	test("manilha beats any non-manilha", () => {
		const vira = card("4", "ouros"); // manilha = 5
		expect(compareCards(card("5", "ouros"), card("3", "paus"), vira)).toBeGreaterThan(0);
	});

	test("manilha vs manilha resolved by suit", () => {
		const vira = card("4", "ouros"); // manilha = 5
		expect(compareCards(card("5", "paus"), card("5", "copas"), vira)).toBeGreaterThan(0);
		expect(compareCards(card("5", "ouros"), card("5", "espadas"), vira)).toBeLessThan(0);
	});
});

describe("cardToString", () => {
	test("formats cards with suit symbols", () => {
		expect(cardToString(card("A", "espadas"))).toBe("A\u2660");
		expect(cardToString(card("7", "copas"))).toBe("7\u2665");
		expect(cardToString(card("3", "paus"))).toBe("3\u2663");
		expect(cardToString(card("Q", "ouros"))).toBe("Q\u2666");
	});
});

describe("cardsEqual", () => {
	test("same card returns true", () => {
		expect(cardsEqual(card("A", "paus"), card("A", "paus"))).toBe(true);
	});

	test("different cards return false", () => {
		expect(cardsEqual(card("A", "paus"), card("A", "copas"))).toBe(false);
		expect(cardsEqual(card("A", "paus"), card("2", "paus"))).toBe(false);
	});
});
