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

	constructor(name: string, model: string, baseURL: string, apiKey: string) {
		this.name = name;
		this.model = model;
		this.baseURL = baseURL.replace(/\/+$/, ""); // strip trailing slash
		this.apiKey = apiKey;
	}

	async chat(messages: ChatMessage[], temperature: number): Promise<LLMResponse> {
		const start = performance.now();

		const res = await fetch(`${this.baseURL}/chat/completions`, {
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
		});

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
