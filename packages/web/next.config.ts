import { resolve } from "node:path";
import { config } from "dotenv";
import type { NextConfig } from "next";

// Load .env from repo root (two levels up from packages/web)
config({ path: resolve(import.meta.dirname, "../../.env") });

const nextConfig: NextConfig = {
	transpilePackages: ["@trucobench/engine", "@trucobench/agents"],
	serverExternalPackages: [
		"openai",
		"@anthropic-ai/sdk",
		"@google/genai",
		"ai",
		"@ai-sdk/openai",
		"@ai-sdk/anthropic",
		"@ai-sdk/google",
	],
};

export default nextConfig;
