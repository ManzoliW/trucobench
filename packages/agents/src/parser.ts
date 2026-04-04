import { type Action, ActionType, type Observation, cardStrength } from "@trucobench/engine";

export interface ParsedResponse {
	reasoning: string;
	action: string;
	cardIndex?: number;
	chat?: string;
}

export interface ParseResult {
	action: Action | null;
	reasoning: string;
	chat?: string;
	raw: string;
	error: string | null;
}

/**
 * Attempt to parse an LLM response string into a ParsedResponse.
 * Handles JSON extraction from markdown code blocks and plain text.
 */
function extractJSON(raw: string): ParsedResponse | null {
	// Try to extract JSON from markdown code block
	const codeBlockMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
	const jsonStr = codeBlockMatch ? codeBlockMatch[1]! : raw;

	// Try to find a JSON object in the string
	const objMatch = jsonStr.match(/\{[\s\S]*\}/);
	if (!objMatch) return null;

	try {
		const parsed = JSON.parse(objMatch[0]);
		return {
			reasoning: String(parsed.reasoning ?? ""),
			action: String(parsed.action ?? ""),
			cardIndex: parsed.card_index !== undefined ? Number(parsed.card_index) : undefined,
			chat: parsed.chat ? String(parsed.chat) : undefined,
		};
	} catch {
		return null;
	}
}

/**
 * Validate a parsed response against the current legal actions.
 */
function validateAction(parsed: ParsedResponse, observation: Observation): Action | null {
	const actionStr = parsed.action.toUpperCase().trim();

	// Map string action to ActionType
	if (actionStr === "PLAY_CARD") {
		if (parsed.cardIndex === undefined) return null;
		const action: Action = { type: ActionType.PLAY_CARD, cardIndex: parsed.cardIndex };
		if (
			observation.legalActions.some(
				(a) =>
					a.type === ActionType.PLAY_CARD && "cardIndex" in a && a.cardIndex === parsed.cardIndex,
			)
		) {
			return action;
		}
		return null;
	}

	const simpleTypes: Record<string, Action["type"]> = {
		TRUCO: ActionType.TRUCO,
		ACCEPT: ActionType.ACCEPT,
		RAISE: ActionType.RAISE,
		FOLD: ActionType.FOLD,
	};

	const type = simpleTypes[actionStr];
	if (!type) return null;

	if (observation.legalActions.some((a) => a.type === type)) {
		return { type } as Action;
	}
	return null;
}

/**
 * Fallback: pick the weakest legal action.
 * Priority: FOLD > weakest PLAY_CARD > ACCEPT > any.
 */
export function weakestLegalAction(observation: Observation): Action {
	const actions = observation.legalActions;

	// Prefer FOLD
	const fold = actions.find((a) => a.type === ActionType.FOLD);
	if (fold) return fold;

	// Weakest card
	const cardPlays = actions.filter(
		(a): a is Extract<Action, { type: "PLAY_CARD" }> => a.type === ActionType.PLAY_CARD,
	);
	if (cardPlays.length > 0) {
		cardPlays.sort(
			(a, b) =>
				cardStrength(observation.hand[a.cardIndex]!, observation.vira) -
				cardStrength(observation.hand[b.cardIndex]!, observation.vira),
		);
		return cardPlays[0]!;
	}

	// Accept or whatever is available
	return actions[0]!;
}

/**
 * Parse an LLM response into a validated Action.
 * Returns the parse result with reasoning and any error info.
 */
export function parseResponse(raw: string, observation: Observation): ParseResult {
	const parsed = extractJSON(raw);
	if (!parsed) {
		return { action: null, reasoning: "", raw, error: "Failed to extract JSON from response" };
	}

	const action = validateAction(parsed, observation);
	if (!action) {
		return {
			action: null,
			reasoning: parsed.reasoning,
			raw,
			error: `Invalid action: "${parsed.action}" cardIndex=${parsed.cardIndex}`,
		};
	}

	return { action, reasoning: parsed.reasoning, chat: parsed.chat, raw, error: null };
}

/**
 * Build a retry prompt when the previous response was invalid.
 */
export function buildRetryPrompt(attempt: number, error: string, observation: Observation): string {
	if (attempt === 1) {
		return `Your response was not valid JSON. Please respond ONLY with a JSON object in this format:\n{"reasoning": "...", "action": "PLAY_CARD|TRUCO|ACCEPT|RAISE|FOLD", "card_index": 0}`;
	}

	const legalList = observation.legalActions
		.map((a) => {
			if (a.type === ActionType.PLAY_CARD && "cardIndex" in a) {
				return `PLAY_CARD with card_index=${a.cardIndex}`;
			}
			return a.type;
		})
		.join(", ");

	return `Your previous response was invalid (${error}). The ONLY valid actions are: ${legalList}. Respond with valid JSON.`;
}
