import { AiSdkProvider } from "./ai-sdk.ts";
import type { ChatMessage, LLMProvider, LLMResponse } from "./types.ts";

function isRateLimitError(error: unknown): boolean {
	if (error instanceof Error) {
		const msg = error.message.toLowerCase();
		if (msg.includes("429") || msg.includes("rate limit")) return true;
		if (msg.includes("529") || msg.includes("overloaded")) return true;
		if (msg.includes("503") || msg.includes("unavailable")) return true;
	}
	if (typeof error === "object" && error !== null && "status" in error) {
		const status = (error as { status: number }).status;
		if (status === 429 || status === 529 || status === 503) return true;
	}
	return false;
}

/**
 * Wraps multiple LLMProviders (all pointing to the same model, different API keys).
 * - Round-robins across keys for even load distribution.
 * - On rate-limit (429/529), instantly tries the next key instead of backing off.
 * - Falls back to exponential backoff only when ALL keys are rate-limited.
 *
 * Usage:
 *   const provider = MultiKeyProvider.fromVercelKeys(
 *     "alibaba/qwen3.7-max",
 *     [process.env.VERCEL_API_KEY_1, process.env.VERCEL_API_KEY_2],
 *   );
 */
export class MultiKeyProvider implements LLMProvider {
	readonly name: string;
	readonly model: string;
	private providers: LLMProvider[];
	private cursor = 0;

	constructor(providers: LLMProvider[]) {
		if (providers.length === 0) throw new Error("MultiKeyProvider: at least one provider required");
		this.providers = providers;
		this.name = providers[0]!.name;
		this.model = providers[0]!.model;
	}

	/**
	 * Convenience factory for multiple Vercel AI Gateway keys on the same model.
	 */
	static fromVercelKeys(model: string, apiKeys: (string | undefined)[]): MultiKeyProvider {
		const validKeys = apiKeys.filter((k): k is string => Boolean(k));
		if (validKeys.length === 0) throw new Error("MultiKeyProvider: no valid API keys provided");
		const providers = validKeys.map((key) => new AiSdkProvider("vercel-gateway", model, key));
		return new MultiKeyProvider(providers);
	}

	/**
	 * Auto-build from env: reads VERCEL_AI_GATEWAY_API_KEY plus VERCEL_AI_GATEWAY_API_KEY_2
	 * through VERCEL_AI_GATEWAY_API_KEY_9, using whichever are set.
	 */
	static fromEnv(model: string): MultiKeyProvider {
		const keys: (string | undefined)[] = [
			process.env.VERCEL_AI_GATEWAY_API_KEY,
			process.env.VERCEL_AI_GATEWAY_API_KEY,    // placeholder — will be deduplicated below
		];

		// Collect numbered keys: VERCEL_AI_GATEWAY_API_KEY_2 … _9
		for (let i = 2; i <= 9; i++) {
			keys.push(process.env[`VERCEL_AI_GATEWAY_API_KEY_${i}`]);
		}

		// Deduplicate and filter empties
		const seen = new Set<string>();
		const uniqueKeys = keys.filter((k): k is string => {
			if (!k) return false;
			if (seen.has(k)) return false;
			seen.add(k);
			return true;
		});

		if (uniqueKeys.length === 0) {
			throw new Error(
				"MultiKeyProvider: No Vercel API keys found in env. " +
				"Set VERCEL_AI_GATEWAY_API_KEY and/or VERCEL_AI_GATEWAY_API_KEY_2 etc.",
			);
		}

		return MultiKeyProvider.fromVercelKeys(model, uniqueKeys);
	}

	async chat(messages: ChatMessage[], temperature: number): Promise<LLMResponse> {
		const n = this.providers.length;
		let lastError: unknown;

		// Try each key once, starting from the current cursor (round-robin)
		for (let attempt = 0; attempt < n; attempt++) {
			const idx = (this.cursor + attempt) % n;
			try {
				const response = await this.providers[idx]!.chat(messages, temperature);
				// Advance cursor so next call starts on the next key
				this.cursor = (idx + 1) % n;
				return response;
			} catch (error) {
				lastError = error;
				if (isRateLimitError(error)) {
					// Rate limit on this key — silently try the next one
					console.warn(
						`[MultiKeyProvider] Key #${idx + 1} rate-limited, trying key #${((idx + 1) % n) + 1}`,
					);
					continue;
				}
				// Non-rate-limit error: re-throw immediately (don't waste other keys)
				throw error;
			}
		}

		// All keys were rate-limited — throw so RetryProvider can back off
		throw lastError;
	}
}
