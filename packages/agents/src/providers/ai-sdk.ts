import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import type { ChatMessage, LLMProvider, LLMResponse } from "./types.ts";

type ProviderFactory =
	| ReturnType<typeof createOpenAI>
	| ReturnType<typeof createAnthropic>
	| ReturnType<typeof createGoogleGenerativeAI>;

/**
 * Unified provider using Vercel AI SDK.
 * Supports any model from OpenAI, Anthropic, Google via a single interface.
 * Can also use OpenRouter as a gateway (one key for all models).
 */
export class AiSdkProvider implements LLMProvider {
	readonly name: string;
	readonly model: string;
	private provider: ProviderFactory;

	constructor(
		providerName:
			| "openai"
			| "anthropic"
			| "google"
			| "openrouter"
			| "vercel-gateway"
			| "huggingface",
		model: string,
		apiKey?: string,
	) {
		this.name = providerName;
		this.model = model;

		switch (providerName) {
			case "openai":
				this.provider = createOpenAI({
					apiKey: apiKey ?? process.env.OPENAI_API_KEY,
				});
				break;
			case "anthropic":
				this.provider = createAnthropic({
					apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY,
				});
				break;
			case "google":
				this.provider = createGoogleGenerativeAI({
					apiKey: apiKey ?? process.env.GOOGLE_API_KEY,
				});
				break;
			case "openrouter":
				this.provider = createOpenAI({
					apiKey: apiKey ?? process.env.OPENROUTER_API_KEY,
					baseURL: "https://openrouter.ai/api/v1",
				});
				break;
			case "vercel-gateway":
				this.provider = createOpenAI({
					apiKey: apiKey ?? process.env.VERCEL_AI_GATEWAY_TOKEN ?? process.env.VERCEL_AI_GATEWAY_API_KEY,
					baseURL: process.env.VERCEL_AI_GATEWAY_BASE ?? process.env.VERCEL_AI_GATEWAY_URL ?? "https://ai-gateway.vercel.sh/v1",
				});
				break;
			case "huggingface":
				this.provider = createOpenAI({
					apiKey: apiKey ?? process.env.HF_TOKEN,
					baseURL: "https://router.huggingface.co/v1",
				});
				break;
		}
	}

	async chat(messages: ChatMessage[], temperature: number): Promise<LLMResponse> {
		const systemMsg = messages.find((m) => m.role === "system");
		const userMsgs = messages
			.filter((m) => m.role !== "system")
			.map((m) => ({
				role: m.role as "user" | "assistant",
				content: m.content,
			}));

		const start = performance.now();
		const result = await generateText({
			model: this.provider(this.model),
			system: systemMsg?.content,
			messages: userMsgs,
			temperature,
		});
		const latencyMs = performance.now() - start;

		return {
			content: result.text,
			inputTokens: (result.usage as unknown as Record<string, number>)?.promptTokens ?? 0,
			outputTokens: (result.usage as unknown as Record<string, number>)?.completionTokens ?? 0,
			latencyMs,
		};
	}
}

/**
 * Convenience: create an OpenRouter provider (single API key for all models).
 *
 * Models available via OpenRouter:
 * - anthropic/claude-sonnet-4-6-20260327
 * - openai/gpt-4o
 * - google/gemini-2.5-pro
 * - deepseek/deepseek-r1
 * - meta-llama/llama-3.3-70b-instruct
 * - etc.
 */
export function createOpenRouterProvider(model: string, apiKey?: string): AiSdkProvider {
	return new AiSdkProvider("openrouter", model, apiKey);
}

/**
 * Convenience: create a Vercel AI Gateway provider (single API key for all models).
 * Set VERCEL_AI_GATEWAY_URL and VERCEL_AI_GATEWAY_API_KEY in .env.
 */
export function createVercelGatewayProvider(model: string, apiKey?: string): AiSdkProvider {
	return new AiSdkProvider("vercel-gateway", model, apiKey);
}

/**
 * Convenience: create a Hugging Face Inference provider.
 * Uses the OpenAI-compatible endpoint at router.huggingface.co.
 * Supports any model on HF Hub — public, gated, or user fine-tunes.
 *
 * Examples:
 * - meta-llama/Llama-3.3-70B-Instruct
 * - mistralai/Mistral-7B-Instruct-v0.3
 * - Qwen/Qwen2.5-72B-Instruct
 * - your-username/your-truco-finetune
 */
export function createHuggingFaceProvider(model: string, apiKey?: string): AiSdkProvider {
	return new AiSdkProvider("huggingface", model, apiKey);
}
