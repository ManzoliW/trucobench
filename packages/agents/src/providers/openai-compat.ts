import type { ChatMessage, LLMProvider, LLMResponse } from "./types.ts";

/**
 * Raw fetch-based OpenAI-compatible provider.
 * No SDK dependencies — works with any endpoint that speaks the OpenAI chat completions API.
 * Ideal for gateways (Vercel AI Gateway, OpenRouter, HuggingFace) where SDKs may inject
 * unwanted auth flows (like OIDC).
 */
export class OpenAICompatProvider implements LLMProvider {
	readonly name: string;
	readonly model: string;
	private baseURL: string;
	private apiKey: string;

	private timeoutMs: number;

	constructor(name: string, model: string, baseURL: string, apiKey: string, timeoutMs = 25_000) {
		this.name = name;
		this.model = model;
		this.baseURL = baseURL.replace(/\/+$/, ""); // strip trailing slash
		this.apiKey = apiKey;
		this.timeoutMs = timeoutMs;
	}

	async chat(messages: ChatMessage[], temperature: number): Promise<LLMResponse> {
		const start = performance.now();

		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
		let res: Response;
		try {
			res = await fetch(`${this.baseURL}/chat/completions`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.apiKey}`,
				},
				body: JSON.stringify({
					model: this.model,
					messages: messages.map((m) => ({ role: m.role, content: m.content })),
					temperature,
				}),
				signal: ctrl.signal,
				cache: "no-store",
			});
		} catch (err) {
			if ((err as Error).name === "AbortError") {
				throw new Error(`${this.name} timeout after ${this.timeoutMs}ms`);
			}
			throw err;
		} finally {
			clearTimeout(timer);
		}

		if (!res.ok) {
			const body = await res.text().catch(() => "");
			throw new Error(`${this.name} API error ${res.status}: ${body.slice(0, 300)}`);
		}

		const data = await res.json();
		const latencyMs = performance.now() - start;

		return {
			content: data.choices?.[0]?.message?.content ?? "",
			inputTokens: data.usage?.prompt_tokens ?? 0,
			outputTokens: data.usage?.completion_tokens ?? 0,
			latencyMs,
		};
	}
}
