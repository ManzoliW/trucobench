import { describe, expect, test } from "bun:test";
import {
	type Card,
	DEFAULT_SIGNAL_CONFIG,
	type SignalConfig,
	generateSignals,
	getVisibleSignals,
	processRoundSignals,
} from "../src/index.ts";

const vira: Card = { rank: "6", suit: "copas" }; // manilhas are 7s

describe("generateSignals", () => {
	test("signals zap when holding paus manilha", () => {
		const hand: Card[] = [
			{ rank: "7", suit: "paus" }, // zap
			{ rank: "4", suit: "ouros" },
			{ rank: "5", suit: "copas" },
		];
		const signals = generateSignals(hand, vira, 0);
		expect(signals).toHaveLength(1);
		expect(signals[0]!.type).toBe("ZAP");
	});

	test("signals strongest manilha first", () => {
		const hand: Card[] = [
			{ rank: "7", suit: "ouros" }, // weakest manilha
			{ rank: "7", suit: "copas" }, // second strongest manilha
			{ rank: "4", suit: "paus" },
		];
		const signals = generateSignals(hand, vira, 0, 1);
		expect(signals[0]!.type).toBe("COPAS");
	});

	test("signals both manilhas when maxSignals=2", () => {
		const hand: Card[] = [
			{ rank: "7", suit: "paus" }, // zap
			{ rank: "7", suit: "copas" },
			{ rank: "4", suit: "ouros" },
		];
		const signals = generateSignals(hand, vira, 0, 2);
		expect(signals).toHaveLength(2);
		expect(signals[0]!.type).toBe("ZAP");
		expect(signals[1]!.type).toBe("COPAS");
	});

	test("signals THREE for non-manilha 3", () => {
		const hand: Card[] = [
			{ rank: "3", suit: "espadas" },
			{ rank: "4", suit: "ouros" },
			{ rank: "5", suit: "copas" },
		];
		const signals = generateSignals(hand, vira, 0);
		expect(signals[0]!.type).toBe("THREE");
	});

	test("signals NOTHING for weak hand", () => {
		const hand: Card[] = [
			{ rank: "4", suit: "ouros" },
			{ rank: "5", suit: "espadas" },
			{ rank: "Q", suit: "copas" },
		];
		const signals = generateSignals(hand, vira, 0);
		expect(signals[0]!.type).toBe("NOTHING");
	});

	test("manilha takes priority over high card", () => {
		const hand: Card[] = [
			{ rank: "3", suit: "paus" }, // high card (not manilha)
			{ rank: "7", suit: "ouros" }, // manilha
			{ rank: "4", suit: "copas" },
		];
		const signals = generateSignals(hand, vira, 0, 1);
		expect(signals[0]!.type).toBe("OUROS");
	});
});

describe("processRoundSignals", () => {
	const hands: [Card[], Card[], Card[], Card[]] = [
		[
			{ rank: "7", suit: "paus" },
			{ rank: "4", suit: "ouros" },
			{ rank: "5", suit: "copas" },
		], // seat 0: has zap
		[
			{ rank: "3", suit: "espadas" },
			{ rank: "4", suit: "paus" },
			{ rank: "Q", suit: "copas" },
		], // seat 1: has 3
		[
			{ rank: "A", suit: "copas" },
			{ rank: "5", suit: "ouros" },
			{ rank: "6", suit: "paus" },
		], // seat 2: has ace
		[
			{ rank: "4", suit: "copas" },
			{ rank: "5", suit: "paus" },
			{ rank: "Q", suit: "ouros" },
		], // seat 3: nothing
	];

	test("generates signals for all 4 players", () => {
		const result = processRoundSignals(hands, vira, DEFAULT_SIGNAL_CONFIG, 42);
		expect(result.results.length).toBe(4);
		expect(result.results[0]!.signal.type).toBe("ZAP");
		expect(result.results[1]!.signal.type).toBe("THREE");
		expect(result.results[2]!.signal.type).toBe("ACE");
		expect(result.results[3]!.signal.type).toBe("NOTHING");
	});

	test("is deterministic with same seed", () => {
		const r1 = processRoundSignals(hands, vira, DEFAULT_SIGNAL_CONFIG, 42);
		const r2 = processRoundSignals(hands, vira, DEFAULT_SIGNAL_CONFIG, 42);
		expect(r1).toEqual(r2);
	});

	test("produces different results with different seeds", () => {
		const r1 = processRoundSignals(hands, vira, DEFAULT_SIGNAL_CONFIG, 1);
		const r2 = processRoundSignals(hands, vira, DEFAULT_SIGNAL_CONFIG, 999);
		// They might coincidentally match, but statistically very unlikely across all fields
		const same =
			r1.results.every((r, i) => r.partnerReceived === r2.results[i]!.partnerReceived) &&
			r1.results.every(
				(r, i) => JSON.stringify(r.interceptedBy) === JSON.stringify(r2.results[i]!.interceptedBy),
			);
		// With 8 random rolls (4 partner + 4*2 opponent), the chance of all matching is extremely low
		expect(same).toBe(false);
	});

	test("disabled config produces no signals", () => {
		const disabled: SignalConfig = { ...DEFAULT_SIGNAL_CONFIG, enabled: false };
		const result = processRoundSignals(hands, vira, disabled, 42);
		expect(result.results).toHaveLength(0);
	});

	test("100% detection rate always delivers to partner", () => {
		const config: SignalConfig = {
			enabled: true,
			partnerDetectionRate: 1.0,
			opponentInterceptionRate: 0,
			maxSignalsPerPlayer: 1,
		};
		const result = processRoundSignals(hands, vira, config, 42);
		for (const r of result.results) {
			expect(r.partnerReceived).toBe(true);
			expect(r.interceptedBy).toHaveLength(0);
		}
	});
});

describe("getVisibleSignals", () => {
	test("seat 0 sees partner (seat 2) signals, not own or teammate-only", () => {
		const config: SignalConfig = {
			enabled: true,
			partnerDetectionRate: 1.0,
			opponentInterceptionRate: 0,
			maxSignalsPerPlayer: 1,
		};
		const hands: [Card[], Card[], Card[], Card[]] = [
			[
				{ rank: "7", suit: "paus" },
				{ rank: "4", suit: "ouros" },
				{ rank: "5", suit: "copas" },
			],
			[
				{ rank: "3", suit: "espadas" },
				{ rank: "4", suit: "paus" },
				{ rank: "Q", suit: "copas" },
			],
			[
				{ rank: "A", suit: "copas" },
				{ rank: "5", suit: "ouros" },
				{ rank: "6", suit: "paus" },
			],
			[
				{ rank: "4", suit: "copas" },
				{ rank: "5", suit: "paus" },
				{ rank: "Q", suit: "ouros" },
			],
		];
		const result = processRoundSignals(hands, vira, config, 42);
		const visible = getVisibleSignals(result, 0);

		// Seat 0's partner is seat 2 (ACE)
		expect(visible.partnerSignals).toHaveLength(1);
		expect(visible.partnerSignals[0]!.type).toBe("ACE");
		expect(visible.partnerSignals[0]!.fromSeat).toBe(2);

		// No interceptions since rate is 0
		expect(visible.interceptedSignals).toHaveLength(0);
	});

	test("seat intercepts opponent signal when caught", () => {
		const config: SignalConfig = {
			enabled: true,
			partnerDetectionRate: 0,
			opponentInterceptionRate: 1.0, // always intercept
			maxSignalsPerPlayer: 1,
		};
		const hands: [Card[], Card[], Card[], Card[]] = [
			[
				{ rank: "4", suit: "ouros" },
				{ rank: "5", suit: "copas" },
				{ rank: "Q", suit: "paus" },
			],
			[
				{ rank: "7", suit: "paus" },
				{ rank: "4", suit: "paus" },
				{ rank: "Q", suit: "copas" },
			], // seat 1: zap
			[
				{ rank: "4", suit: "copas" },
				{ rank: "5", suit: "ouros" },
				{ rank: "Q", suit: "espadas" },
			],
			[
				{ rank: "4", suit: "espadas" },
				{ rank: "5", suit: "paus" },
				{ rank: "6", suit: "ouros" },
			],
		];
		const result = processRoundSignals(hands, vira, config, 42);
		const visible = getVisibleSignals(result, 0);

		// Seat 0's opponents are seats 1 and 3
		// Seat 1 signaled ZAP — seat 0 should have intercepted it
		const zapIntercepted = visible.interceptedSignals.find((s) => s.type === "ZAP");
		expect(zapIntercepted).toBeDefined();
		expect(zapIntercepted!.fromSeat).toBe(1);
	});
});
