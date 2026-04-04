export { Game } from "./game.ts";
export { FourPlayerGame, teamOf, partnerOf, nextSeat } from "./game4p.ts";
export {
	DEFAULT_SIGNAL_CONFIG,
	generateSignals,
	processRoundSignals,
	processSingleSignal,
	getVisibleSignals,
} from "./signals.ts";
export type { SignalType, Signal, SignalResult, RoundSignals, SignalConfig } from "./signals.ts";
export type {
	SeatId,
	FourPlayerTrickResult,
	FourPlayerRoundState,
	FourPlayerGameState,
	FourPlayerObservation,
} from "./game4p.ts";
export {
	shuffleDeck,
	deal,
	getManilhaRank,
	isManilha,
	cardStrength,
	compareCards,
	cardToString,
	cardsEqual,
} from "./deck.ts";
export {
	createEscalationState,
	nextEscalationLevel,
	foldPoints,
	currentPoints,
	canEscalate,
	canRaise,
	processEscalation,
} from "./escalation.ts";
export { resolveTrick, resolveRound, canDecideEarly, otherPlayer } from "./round.ts";
export {
	Suits,
	Ranks,
	ActionType,
	EscalationLevel,
	ESCALATION_POINTS,
	ESCALATION_ORDER,
} from "./types.ts";
export type {
	Suit,
	Rank,
	Card,
	PlayerId,
	Action,
	PlayCardAction,
	SimpleAction,
	TrickResult,
	RoundResult,
	EscalationState,
	RoundState,
	GameState,
	Observation,
	StepResult,
} from "./types.ts";
