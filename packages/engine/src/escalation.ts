import {
	type Action,
	ActionType,
	ESCALATION_ORDER,
	ESCALATION_POINTS,
	type EscalationLevel,
	type EscalationState,
	type PlayerId,
} from "./types.ts";

export function createEscalationState(): EscalationState {
	return {
		level: "NORMAL",
		pendingRequest: null,
		requestedBy: null,
		lastEscalatedBy: null,
	};
}

/** Get the next escalation level, or null if already at max. */
export function nextEscalationLevel(current: EscalationLevel): EscalationLevel | null {
	const idx = ESCALATION_ORDER.indexOf(current);
	if (idx >= ESCALATION_ORDER.length - 1) return null;
	return ESCALATION_ORDER[idx + 1] ?? null;
}

/** Points awarded if a fold happens at the current state. */
export function foldPoints(state: EscalationState): number {
	// On fold, the caller wins the points of the level BEFORE the pending request
	return ESCALATION_POINTS[state.level];
}

/** Points at the current confirmed escalation level. */
export function currentPoints(state: EscalationState): number {
	return ESCALATION_POINTS[state.level];
}

/** Can this player initiate or raise an escalation? */
export function canEscalate(state: EscalationState, player: PlayerId): boolean {
	// Can't escalate if there's already a pending request
	if (state.pendingRequest !== null) return false;
	// Can't escalate if this player was the last to escalate
	if (state.lastEscalatedBy === player) return false;
	// Can't escalate if already at max
	return nextEscalationLevel(state.level) !== null;
}

/** Can this player raise (counter-escalate) in response to a pending request? */
export function canRaise(state: EscalationState, player: PlayerId): boolean {
	// Can only raise if there IS a pending request and it wasn't made by this player
	if (state.pendingRequest === null) return false;
	if (state.requestedBy === player) return false;
	// Can only raise if there's a level above the pending request
	return nextEscalationLevel(state.pendingRequest) !== null;
}

export interface EscalationResult {
	state: EscalationState;
	folded: boolean;
	foldedBy: PlayerId | null;
	foldPoints: number;
}

/**
 * Process an escalation-related action. Returns the new state.
 * Only call this for TRUCO, ACCEPT, RAISE, FOLD actions.
 */
export function processEscalation(
	state: EscalationState,
	player: PlayerId,
	action: Action,
): EscalationResult {
	const result: EscalationResult = {
		state: { ...state },
		folded: false,
		foldedBy: null,
		foldPoints: 0,
	};

	switch (action.type) {
		case ActionType.TRUCO: {
			// Player initiates escalation. The next level above current becomes the pending request.
			const next = nextEscalationLevel(state.level);
			if (!next) throw new Error("Cannot escalate beyond DOZE");
			result.state = {
				...state,
				pendingRequest: next,
				requestedBy: player,
			};
			break;
		}

		case ActionType.ACCEPT: {
			// Accept the pending request — level moves to the requested level
			if (state.pendingRequest === null) throw new Error("Nothing to accept");
			result.state = {
				level: state.pendingRequest,
				pendingRequest: null,
				requestedBy: null,
				lastEscalatedBy: state.requestedBy,
			};
			break;
		}

		case ActionType.RAISE: {
			// Counter-escalate: accept the current request AND raise to the next level
			if (state.pendingRequest === null) throw new Error("Nothing to raise against");
			const nextLevel = nextEscalationLevel(state.pendingRequest);
			if (!nextLevel) throw new Error("Cannot raise beyond DOZE");
			result.state = {
				level: state.pendingRequest, // accept the current request
				pendingRequest: nextLevel, // and raise to the next
				requestedBy: player,
				lastEscalatedBy: state.requestedBy, // previous requester was last to escalate
			};
			break;
		}

		case ActionType.FOLD: {
			result.folded = true;
			result.foldedBy = player;
			result.foldPoints = foldPoints(state);
			break;
		}

		default:
			throw new Error(`Not an escalation action: ${action.type}`);
	}

	return result;
}
