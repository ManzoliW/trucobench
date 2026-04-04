import { describe, expect, test } from "bun:test";
import { canDecideEarly, resolveRound, resolveTrick } from "../src/round.ts";
import type { Card, TrickResult } from "../src/types.ts";

function card(rank: string, suit: string): Card {
	return { rank, suit } as Card;
}

const vira = card("4", "ouros"); // manilha = 5

describe("resolveTrick", () => {
	test("higher card wins", () => {
		const result = resolveTrick(0, card("3", "copas"), card("K", "espadas"), vira);
		expect(result.winner).toBe(0);
	});

	test("second player wins with higher card", () => {
		const result = resolveTrick(0, card("K", "copas"), card("3", "espadas"), vira);
		expect(result.winner).toBe(1);
	});

	test("same rank non-manilha is a draw", () => {
		const result = resolveTrick(0, card("K", "copas"), card("K", "espadas"), vira);
		expect(result.winner).toBeNull();
	});

	test("manilha beats non-manilha", () => {
		const result = resolveTrick(0, card("5", "ouros"), card("3", "paus"), vira);
		expect(result.winner).toBe(0);
	});

	test("manilha vs manilha resolved by suit", () => {
		const result = resolveTrick(0, card("5", "ouros"), card("5", "paus"), vira);
		expect(result.winner).toBe(1); // paus (zap) beats ouros
	});

	test("records both cards and first player", () => {
		const result = resolveTrick(1, card("A", "copas"), card("2", "paus"), vira);
		expect(result.firstPlayer).toBe(1);
		expect(result.cards[0]).toEqual(card("A", "copas"));
		expect(result.cards[1]).toEqual(card("2", "paus"));
	});
});

describe("resolveRound", () => {
	function trick(winner: 0 | 1 | null, firstPlayer: 0 | 1 = 0): TrickResult {
		return {
			cards: [card("A", "copas"), card("K", "copas")],
			firstPlayer,
			winner,
		};
	}

	test("player wins 2-0 (first two tricks)", () => {
		expect(resolveRound([trick(0), trick(0)])).toBe(0);
	});

	test("player wins 2-1", () => {
		expect(resolveRound([trick(0), trick(1), trick(0)])).toBe(0);
	});

	test("trick 1 draw, trick 2 decides", () => {
		expect(resolveRound([trick(null), trick(1)])).toBe(1);
	});

	test("trick 1 draw, trick 2 draw, trick 3 decides", () => {
		expect(resolveRound([trick(null), trick(null), trick(0)])).toBe(0);
	});

	test("all three tricks draw: first player wins", () => {
		expect(resolveRound([trick(null, 0), trick(null), trick(null)])).toBe(0);
		expect(resolveRound([trick(null, 1), trick(null), trick(null)])).toBe(1);
	});

	test("trick 1 winner, trick 2 draw: trick 1 winner takes round", () => {
		expect(resolveRound([trick(1), trick(null)])).toBe(1);
	});

	test("trick 1 and 2 different winners, trick 3 draw: trick 1 winner wins", () => {
		expect(resolveRound([trick(0), trick(1), trick(null)])).toBe(0);
	});

	test("trick 1 and 2 different winners, trick 3 decides", () => {
		expect(resolveRound([trick(0), trick(1), trick(1)])).toBe(1);
	});

	test("not enough tricks returns null", () => {
		expect(resolveRound([])).toBeNull();
		expect(resolveRound([trick(0)])).toBeNull();
	});
});

describe("canDecideEarly", () => {
	function trick(winner: 0 | 1 | null): TrickResult {
		return {
			cards: [card("A", "copas"), card("K", "copas")],
			firstPlayer: 0,
			winner,
		};
	}

	test("same player wins first two tricks", () => {
		expect(canDecideEarly([trick(0), trick(0)])).toBe(0);
		expect(canDecideEarly([trick(1), trick(1)])).toBe(1);
	});

	test("trick 1 draw, trick 2 winner decides", () => {
		expect(canDecideEarly([trick(null), trick(0)])).toBe(0);
	});

	test("trick 1 winner, trick 2 draw: trick 1 winner wins early", () => {
		expect(canDecideEarly([trick(1), trick(null)])).toBe(1);
	});

	test("different winners: no early decision", () => {
		expect(canDecideEarly([trick(0), trick(1)])).toBeNull();
	});

	test("not enough tricks", () => {
		expect(canDecideEarly([trick(0)])).toBeNull();
		expect(canDecideEarly([])).toBeNull();
	});
});
