import { describe, expect, test } from "bun:test";
import {
	canEscalate,
	canRaise,
	createEscalationState,
	currentPoints,
	foldPoints,
	nextEscalationLevel,
	processEscalation,
} from "../src/escalation.ts";
import { ActionType } from "../src/types.ts";

describe("escalation levels", () => {
	test("nextEscalationLevel follows the chain", () => {
		expect(nextEscalationLevel("NORMAL")).toBe("TRUCO");
		expect(nextEscalationLevel("TRUCO")).toBe("SEIS");
		expect(nextEscalationLevel("SEIS")).toBe("NOVE");
		expect(nextEscalationLevel("NOVE")).toBe("DOZE");
		expect(nextEscalationLevel("DOZE")).toBeNull();
	});

	test("currentPoints returns correct values", () => {
		const state = createEscalationState();
		expect(currentPoints(state)).toBe(1);
		expect(currentPoints({ ...state, level: "TRUCO" })).toBe(3);
		expect(currentPoints({ ...state, level: "SEIS" })).toBe(6);
		expect(currentPoints({ ...state, level: "NOVE" })).toBe(9);
		expect(currentPoints({ ...state, level: "DOZE" })).toBe(12);
	});
});

describe("canEscalate", () => {
	test("either player can escalate from NORMAL", () => {
		const state = createEscalationState();
		expect(canEscalate(state, 0)).toBe(true);
		expect(canEscalate(state, 1)).toBe(true);
	});

	test("cannot escalate if there is a pending request", () => {
		const state = {
			...createEscalationState(),
			pendingRequest: "TRUCO" as const,
			requestedBy: 0 as const,
		};
		expect(canEscalate(state, 0)).toBe(false);
		expect(canEscalate(state, 1)).toBe(false);
	});

	test("cannot escalate if this player was the last to escalate", () => {
		const state = {
			...createEscalationState(),
			level: "TRUCO" as const,
			lastEscalatedBy: 0 as const,
		};
		expect(canEscalate(state, 0)).toBe(false);
		expect(canEscalate(state, 1)).toBe(true);
	});

	test("cannot escalate from DOZE (already max)", () => {
		const state = {
			...createEscalationState(),
			level: "DOZE" as const,
			lastEscalatedBy: 0 as const,
		};
		expect(canEscalate(state, 1)).toBe(false);
	});
});

describe("canRaise", () => {
	test("can raise when there is a pending request not at max", () => {
		const state = {
			...createEscalationState(),
			pendingRequest: "TRUCO" as const,
			requestedBy: 0 as const,
		};
		expect(canRaise(state, 1)).toBe(true);
		expect(canRaise(state, 0)).toBe(false); // requester can't raise their own
	});

	test("cannot raise if pending is DOZE (no higher level)", () => {
		const state = {
			...createEscalationState(),
			level: "NOVE" as const,
			pendingRequest: "DOZE" as const,
			requestedBy: 0 as const,
		};
		expect(canRaise(state, 1)).toBe(false);
	});

	test("cannot raise if no pending request", () => {
		expect(canRaise(createEscalationState(), 0)).toBe(false);
	});
});

describe("processEscalation", () => {
	test("TRUCO creates a pending request", () => {
		const state = createEscalationState();
		const result = processEscalation(state, 0, { type: ActionType.TRUCO });
		expect(result.folded).toBe(false);
		expect(result.state.pendingRequest).toBe("TRUCO");
		expect(result.state.requestedBy).toBe(0);
	});

	test("ACCEPT moves level to the pending request", () => {
		const state = {
			...createEscalationState(),
			pendingRequest: "TRUCO" as const,
			requestedBy: 0 as const,
		};
		const result = processEscalation(state, 1, { type: ActionType.ACCEPT });
		expect(result.state.level).toBe("TRUCO");
		expect(result.state.pendingRequest).toBeNull();
		expect(result.state.lastEscalatedBy).toBe(0);
	});

	test("RAISE accepts current and escalates further", () => {
		const state = {
			...createEscalationState(),
			pendingRequest: "TRUCO" as const,
			requestedBy: 0 as const,
		};
		const result = processEscalation(state, 1, { type: ActionType.RAISE });
		expect(result.state.level).toBe("TRUCO"); // accepted TRUCO
		expect(result.state.pendingRequest).toBe("SEIS"); // raised to SEIS
		expect(result.state.requestedBy).toBe(1);
		expect(result.state.lastEscalatedBy).toBe(0); // previous requester
	});

	test("FOLD returns fold points", () => {
		const state = {
			...createEscalationState(),
			pendingRequest: "TRUCO" as const,
			requestedBy: 0 as const,
		};
		const result = processEscalation(state, 1, { type: ActionType.FOLD });
		expect(result.folded).toBe(true);
		expect(result.foldedBy).toBe(1);
		expect(result.foldPoints).toBe(1); // NORMAL level points
	});

	test("fold at higher level gives correct points", () => {
		const state = {
			...createEscalationState(),
			level: "TRUCO" as const,
			pendingRequest: "SEIS" as const,
			requestedBy: 0 as const,
		};
		const result = processEscalation(state, 1, { type: ActionType.FOLD });
		expect(result.foldPoints).toBe(3); // TRUCO level points (pre-escalation)
	});

	test("full escalation chain: TRUCO -> SEIS -> NOVE -> DOZE", () => {
		let state = createEscalationState();

		// Player 0 calls TRUCO
		let result = processEscalation(state, 0, { type: ActionType.TRUCO });
		state = result.state;

		// Player 1 raises to SEIS
		result = processEscalation(state, 1, { type: ActionType.RAISE });
		state = result.state;
		expect(state.level).toBe("TRUCO");
		expect(state.pendingRequest).toBe("SEIS");

		// Player 0 raises to NOVE
		result = processEscalation(state, 0, { type: ActionType.RAISE });
		state = result.state;
		expect(state.level).toBe("SEIS");
		expect(state.pendingRequest).toBe("NOVE");

		// Player 1 raises to DOZE
		result = processEscalation(state, 1, { type: ActionType.RAISE });
		state = result.state;
		expect(state.level).toBe("NOVE");
		expect(state.pendingRequest).toBe("DOZE");

		// Player 0 accepts DOZE
		result = processEscalation(state, 0, { type: ActionType.ACCEPT });
		state = result.state;
		expect(state.level).toBe("DOZE");
		expect(state.pendingRequest).toBeNull();
		expect(state.lastEscalatedBy).toBe(1);
	});
});
