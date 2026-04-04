import OpenAI from "openai";
import type { ChatMessage, LLMProvider, LLMResponse } from "./types.ts";

export class DeepSeekProvider implements LLMProvider {
	readonly name = "deepseek";
	readonly model: string;
	private client: OpenAI;

	constructor(model: string, apiKey?: string) {
		this.model = model;
		this.client = new OpenAI({
			apiKey: apiKey ?? process.env.DEEPSEEK_API_KEY,
			baseURL: "https://api.deepseek.com/v1",
		});
	}

	async chat(messages: ChatMessage[], temperature: number): Promise<LLMResponse> {
		const start = performance.now();
		const response = await this.client.chat.completions.create({
			model: this.model,
			messages: messages.map((m) => ({ role: m.role, content: m.content })),
			temperature,
		});
		const latencyMs = performance.now() - start;

		return {
			content: response.choices[0]?.message?.content ?? "",
			inputTokens: response.usage?.prompt_tokens ?? 0,
			outputTokens: response.usage?.completion_tokens ?? 0,
			latencyMs,
		};
	}
}
