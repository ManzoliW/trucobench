import { GoogleGenAI } from "@google/genai";
import type { ChatMessage, LLMProvider, LLMResponse } from "./types.ts";

export class GoogleProvider implements LLMProvider {
	readonly name = "google";
	readonly model: string;
	private client: GoogleGenAI;

	constructor(model: string, apiKey?: string) {
		this.model = model;
		this.client = new GoogleGenAI({ apiKey: apiKey ?? process.env.GOOGLE_API_KEY });
	}

	async chat(messages: ChatMessage[], temperature: number): Promise<LLMResponse> {
		const systemMsg = messages.find((m) => m.role === "system");
		const conversationMsgs = messages
			.filter((m) => m.role !== "system")
			.map((m) => ({
				role: m.role as "user" | "model",
				parts: [{ text: m.content }],
			}));

		const start = performance.now();
		const response = await this.client.models.generateContent({
			model: this.model,
			contents: conversationMsgs,
			config: {
				temperature,
				systemInstruction: systemMsg?.content,
			},
		});
		const latencyMs = performance.now() - start;

		return {
			content: response.text ?? "",
			inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
			outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
			latencyMs,
		};
	}
}
