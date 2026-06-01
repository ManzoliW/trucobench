import type { ChatMessage, LLMProvider, LLMResponse } from "./types.ts";

export interface RetryOptions {
	maxRetries: number;
	baseDelayMs: number;
	maxDelayMs: number;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
	maxRetries: 2,
	baseDelayMs: 1000,
	maxDelayMs: 8_000,
};

function isRetryableError(error: unknown): boolean {
	if (error instanceof Error) {
		const msg = error.message.toLowerCase();
		// Rate limit (429), overloaded (529), server errors (5xx)
		if (msg.includes("429") || msg.includes("rate limit")) return true;
		if (msg.includes("529") || msg.includes("overloaded")) return true;
		if (msg.includes("500") || msg.includes("502") || msg.includes("503")) return true;
		if (msg.includes("timeout") || msg.includes("econnreset")) return true;
	}
	// Check for response-like objects with status codes
	if (typeof error === "object" && error !== null && "status" in error) {
		const status = (error as { status: number }).status;
		if (status === 429 || status === 529 || status >= 500) return true;
	}
	return false;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps an LLMProvider with exponential backoff retry logic.
 */
export class RetryProvider implements LLMProvider {
	readonly name: string;
	readonly model: string;
	private inner: LLMProvider;
	private options: RetryOptions;

	constructor(provider: LLMProvider, options?: Partial<RetryOptions>) {
		this.inner = provider;
		this.name = provider.name;
		this.model = provider.model;
		this.options = { ...DEFAULT_RETRY_OPTIONS, ...options };
	}

	async chat(messages: ChatMessage[], temperature: number): Promise<LLMResponse> {
		let lastError: unknown;

		for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
			try {
				return await this.inner.chat(messages, temperature);
			} catch (error) {
				lastError = error;

				if (!isRetryableError(error) || attempt === this.options.maxRetries) {
					throw error;
				}

				const jitter = Math.random() * 0.5 + 0.75; // 0.75-1.25x
				const backoff = Math.min(
					this.options.baseDelayMs * 2 ** attempt * jitter,
					this.options.maxDelayMs,
				);

				console.warn(
					`[${this.name}/${this.model}] Retry ${attempt + 1}/${this.options.maxRetries} after ${Math.round(backoff)}ms: ${error instanceof Error ? error.message : String(error)}`,
				);

				await delay(backoff);
			}
		}

		throw lastError;
	}
}
