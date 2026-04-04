import type { Action, Observation } from "@trucobench/engine";
import type { Agent } from "./base-agent.ts";
import { buildRetryPrompt, parseResponse, weakestLegalAction } from "./parser.ts";
import { type PromptOptions, serializePrompt } from "./prompt.ts";
import type { ChatMessage, LLMProvider, LLMResponse } from "./providers/types.ts";

const MAX_RETRIES = 3;
const DEFAULT_TEMPERATURE = 0.7;

/** Short system prompt (~30 tokens) for cost-conscious usage */
const COMPACT_SYSTEM_PROMPT =
	"Expert Truco Paulista player. Bluff strategically (truco on weak hands). Detect opponent bluffs via score/trick context. Fold when weak. Risk more when behind. Respond JSON only.";

/** Full system prompt (~180 tokens) for maximum play quality */
const FULL_SYSTEM_PROMPT = [
	"You are an expert Truco Paulista player with deep understanding of bluffing and psychological play.",
	"",
	"Core strategic principles:",
	"- BLUFFING: Calling truco with a weak hand is a legitimate and powerful strategy. Consider bluffing when: you won the first trick, the score is against you, or the opponent has been folding often.",
	"- BLUFF DETECTION: When your opponent calls truco, consider: did they win trick 1 easily (likely strong) or barely? Is the score in their favor (less need to bluff) or against them (more likely to bluff)?",
	"- FOLDING IS STRATEGIC: Fold when genuinely weak AND opponent likely strong. But don't always fold — that invites more bluffs.",
	"- SCORE AWARENESS: When behind, bluff more and accept more. When ahead, play conservatively.",
	"- ESCALATION TIMING: Calling truco BEFORE playing your strong card creates more pressure.",
	"",
	"Analyze the game state carefully and respond with a valid JSON action.",
].join("\n");

export interface LLMAgentOptions {
	provider: LLMProvider;
	promptOptions?: PromptOptions;
	temperature?: number;
	systemPrompt?: string;
	/** Use compact system prompt to reduce token usage. Default: false */
	economyMode?: boolean;
}

export interface ActionTrace {
	reasoning: string;
	chat?: string;
	action: Action;
	raw: string;
	attempts: number;
	fallback: boolean;
	response: LLMResponse;
	retryResponses: LLMResponse[];
}

export class LLMAgent implements Agent {
	readonly name: string;
	private provider: LLMProvider;
	private promptOptions: PromptOptions;
	private temperature: number;
	private systemPrompt: string;

	/** Last action trace for metric collection */
	lastTrace: ActionTrace | null = null;

	/** Cumulative stats */
	stats = {
		totalActions: 0,
		parseFailures: 0,
		fallbacks: 0,
		totalInputTokens: 0,
		totalOutputTokens: 0,
		totalLatencyMs: 0,
	};

	constructor(options: LLMAgentOptions) {
		this.provider = options.provider;
		this.name = `${options.provider.name}/${options.provider.model}`;
		this.promptOptions = options.promptOptions ?? { variant: "standard", language: "en" };
		this.temperature = options.temperature ?? DEFAULT_TEMPERATURE;
		this.systemPrompt =
			options.systemPrompt ?? (options.economyMode ? COMPACT_SYSTEM_PROMPT : FULL_SYSTEM_PROMPT);
	}

	async getAction(observation: Observation): Promise<Action> {
		const prompt = serializePrompt(observation, this.promptOptions);
		const messages: ChatMessage[] = [
			{ role: "system", content: this.systemPrompt },
			{ role: "user", content: prompt },
		];

		const retryResponses: LLMResponse[] = [];
		let lastResponse: LLMResponse | null = null;

		for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
			const response = await this.provider.chat(messages, this.temperature);
			lastResponse = response;

			this.stats.totalInputTokens += response.inputTokens;
			this.stats.totalOutputTokens += response.outputTokens;
			this.stats.totalLatencyMs += response.latencyMs;

			const result = parseResponse(response.content, observation);

			if (result.action) {
				this.stats.totalActions++;
				this.lastTrace = {
					reasoning: result.reasoning,
					chat: result.chat,
					action: result.action,
					raw: response.content,
					attempts: attempt + 1,
					fallback: false,
					response,
					retryResponses,
				};
				return result.action;
			}

			// Parse failed — add retry context
			if (attempt < MAX_RETRIES) {
				this.stats.parseFailures++;
				retryResponses.push(response);
				messages.push({ role: "assistant", content: response.content });
				messages.push({
					role: "user",
					content: buildRetryPrompt(attempt + 1, result.error ?? "unknown", observation),
				});
			}
		}

		// All retries exhausted — fallback to weakest legal action
		const fallbackAction = weakestLegalAction(observation);
		this.stats.totalActions++;
		this.stats.fallbacks++;
		this.stats.parseFailures++;
		this.lastTrace = {
			reasoning: "",
			action: fallbackAction,
			raw: lastResponse?.content ?? "",
			attempts: MAX_RETRIES + 1,
			fallback: true,
			response: lastResponse!,
			retryResponses,
		};
		return fallbackAction;
	}
}
