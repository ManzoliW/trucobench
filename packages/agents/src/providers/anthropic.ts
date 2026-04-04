import Anthropic from "@anthropic-ai/sdk";
import type { ChatMessage, LLMProvider, LLMResponse } from "./types.ts";

export class AnthropicProvider implements LLMProvider {
	readonly name = "anthropic";
	readonly model: string;
	private client: Anthropic;

	constructor(model: string, apiKey?: string) {
		this.model = model;
		this.client = new Anthropic({ apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY });
	}

	async chat(messages: ChatMessage[], temperature: number): Promise<LLMResponse> {
		// Separate system message from conversation messages
		const systemMsg = messages.find((m) => m.role === "system");
		const conversationMsgs = messages
			.filter((m) => m.role !== "system")
			.map((m) => ({
				role: m.role as "user" | "assistant",
				content: m.content,
			}));

		const start = performance.now();
		const response = await this.client.messages.create({
			model: this.model,
			max_tokens: 1024,
			temperature,
			system: systemMsg?.content,
			messages: conversationMsgs,
		});
		const latencyMs = performance.now() - start;

		const content = response.content[0]?.type === "text" ? response.content[0].text : "";

		return {
			content,
			inputTokens: response.usage.input_tokens,
			outputTokens: response.usage.output_tokens,
			latencyMs,
		};
	}
}
