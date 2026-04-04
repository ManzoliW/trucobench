import type { ChatMessage, LLMProvider, LLMResponse } from "./types.ts";

export class OllamaProvider implements LLMProvider {
	readonly name = "ollama";
	readonly model: string;
	private baseURL: string;

	constructor(model: string, baseURL?: string) {
		this.model = model;
		this.baseURL = baseURL ?? process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
	}

	async chat(messages: ChatMessage[], temperature: number): Promise<LLMResponse> {
		const start = performance.now();
		const response = await fetch(`${this.baseURL}/api/chat`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: this.model,
				messages: messages.map((m) => ({ role: m.role, content: m.content })),
				options: { temperature },
				stream: false,
			}),
		});
		const latencyMs = performance.now() - start;

		if (!response.ok) {
			throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
		}

		const data = (await response.json()) as {
			message?: { content?: string };
			prompt_eval_count?: number;
			eval_count?: number;
		};

		return {
			content: data.message?.content ?? "",
			inputTokens: data.prompt_eval_count ?? 0,
			outputTokens: data.eval_count ?? 0,
			latencyMs,
		};
	}
}
