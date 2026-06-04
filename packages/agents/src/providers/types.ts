export interface LLMResponse {
	content: string;
	inputTokens: number;
	outputTokens: number;
	latencyMs: number;
}

export interface LLMProvider {
	readonly name: string;
	readonly model: string;
	chat(messages: ChatMessage[], temperature: number, tools?: Record<string, any>): Promise<LLMResponse>;
}

export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}
