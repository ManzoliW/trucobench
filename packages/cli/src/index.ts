import { parseArgs } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import {
	type Agent,
	AnthropicProvider,
	DeepSeekProvider,
	GoogleProvider,
	HeuristicAgent,
	LLMAgent,
	type LLMProvider,
	OllamaProvider,
	OpenAIProvider,
	type PromptLanguage,
	type PromptOptions,
	type PromptVariant,
	RandomAgent,
	RetryProvider,
	AiSdkProvider,
	MultiKeyProvider,
	CFRAgent,
} from "@trucobench/agents";

// Automatically load .env for Node.js environments (Bun does this natively)
// @ts-ignore - process.loadEnvFile is Node 20.6+
if (typeof process.loadEnvFile === "function") {
	if (existsSync(".env")) process.loadEnvFile(".env");
	if (existsSync(".env.local")) process.loadEnvFile(".env.local");
}
import {
	type AgentFactory,
	type TournamentConfig,
	generateReport,
	playMatchup,
	reportToCSV,
	reportToJSON,
	reportToMarkdown,
	runTournament,
	runTournamentParallel,
	runDiagnostics,
	createExampleScenario,
	saveTournamentResult,
} from "@trucobench/bench";

type ProviderMode = "native" | "vercel" | "openrouter" | "hf";

interface AgentConfig {
	prompt: PromptVariant;
	language: PromptLanguage;
	temperature: number;
	mode: ProviderMode;
	useTools?: boolean;
}

function createAgent(name: string, cfg: AgentConfig): Agent {
	if (name === "random") return new RandomAgent();
	if (name === "heuristic") return new HeuristicAgent();
	if (name === "cfr") {
		let strategyPath = "scripts/cfr/truco_cfr_strategy.pkl";
		if (!existsSync(strategyPath)) {
			strategyPath = "scripts/cfr/truco_cfr_smoke.pkl";
		}
		if (process.env.CFR_STRATEGY_PATH) {
			strategyPath = process.env.CFR_STRATEGY_PATH;
		}
		return new CFRAgent(strategyPath);
	}

	const promptOptions: PromptOptions = { variant: cfg.prompt, language: cfg.language };

	function wrap(provider: LLMProvider): Agent {
		return new LLMAgent({
			provider: new RetryProvider(provider),
			promptOptions,
			temperature: cfg.temperature,
			useTools: cfg.useTools,
		});
	}

	// Gateway modes (Vercel, OpenRouter, HF) use AiSdkProvider
	if (cfg.mode === "vercel") {
		let vercelName = name;
		if (name === "qwen-3.7-max") vercelName = "alibaba/qwen3.7-max";
		if (name === "qwen-3.7-plus") vercelName = "alibaba/qwen3.7-plus";
		if (name === "kimi-k2.5") vercelName = "moonshotai/kimi-k2.5";
		// Use MultiKeyProvider if a second key is set — doubles throughput
		const key1 = process.env.VERCEL_AI_GATEWAY_API_KEY;
		const key2 = process.env.VERCEL_AI_GATEWAY_API_KEY_2;
		const uniqueKeys = [...new Set([key1, key2].filter(Boolean))] as string[];
		const provider = uniqueKeys.length > 1
			? MultiKeyProvider.fromVercelKeys(vercelName, uniqueKeys)
			: new AiSdkProvider("vercel-gateway", vercelName);
		return wrap(provider);
	}
	if (cfg.mode === "openrouter") {
		return wrap(new AiSdkProvider("openrouter", name));
	}
	if (cfg.mode === "hf") {
		return wrap(new AiSdkProvider("huggingface", name));
	}

	// Native mode: use direct SDKs for better performance/reliability
	const providerMap: Record<string, () => Agent> = {
		"gpt-4o": () => wrap(new OpenAIProvider("gpt-4o")),
		"gpt-4o-mini": () => wrap(new OpenAIProvider("gpt-4o-mini")),
		"claude-sonnet-4.6": () => wrap(new AnthropicProvider("claude-sonnet-4-6-20260327")),
		"claude-haiku-4.5": () => wrap(new AnthropicProvider("claude-haiku-4-5-20251001")),
		"gemini-2.5-pro": () => wrap(new GoogleProvider("gemini-2.5-pro")),
		"gemini-2.5-flash": () => wrap(new GoogleProvider("gemini-2.5-flash")),
		"deepseek-r1": () => wrap(new DeepSeekProvider("deepseek-reasoner")),
		"qwen-3.7-max": () => wrap(new AiSdkProvider("vercel-gateway", "alibaba/qwen3.7-max")),
		"qwen-3.7-plus": () => wrap(new AiSdkProvider("vercel-gateway", "alibaba/qwen3.7-plus")),
		"kimi-k2.5": () => wrap(new AiSdkProvider("vercel-gateway", "moonshotai/kimi-k2.5")),
	};

	const factory = providerMap[name];
	if (factory) return factory();

	if (name.startsWith("ollama/")) {
		const model = name.slice(7);
		return wrap(new OllamaProvider(model));
	}

	throw new Error(
		`Unknown agent: ${name} (mode: ${cfg.mode}). Available: random, heuristic, ${Object.keys(providerMap).join(", ")}, ollama/<model>`,
	);
}

function parseAgentConfig(values: Record<string, string | boolean | undefined>): AgentConfig {
	return {
		prompt: (values.prompt as PromptVariant) || "standard",
		language: (values.language as PromptLanguage) || "en",
		temperature: Number.parseFloat((values.temperature as string) || "0.7"),
		mode: (values.provider as ProviderMode) || "native",
		useTools: !!values.tools,
	};
}

async function runCommand() {
	const { values } = parseArgs({
		args: process.argv.slice(2),
		options: {
			a: { type: "string" },
			b: { type: "string" },
			games: { type: "string", default: "10" },
			duplicate: { type: "boolean", default: false },
			seed: { type: "string", default: "42" },
			prompt: { type: "string", default: "standard" },
			language: { type: "string", default: "en" },
			temperature: { type: "string", default: "0.7" },
			provider: { type: "string", default: "native" },
			output: { type: "string" },
		},
		allowPositionals: true,
	});

	if (!values.a || !values.b) {
		console.error(
			"Usage: run --a <agent> --b <agent> [--games N] [--provider native|vercel|openrouter] [--prompt standard]",
		);
		process.exit(1);
	}

	const cfg = parseAgentConfig(values);
	const gamesCount = Number.parseInt(values.games!, 10);
	const seed = Number.parseInt(values.seed!, 10);

	console.log(`Running ${gamesCount} games: ${values.a} vs ${values.b}`);
	console.log(`  provider=${cfg.mode} prompt=${cfg.prompt} language=${cfg.language} temperature=${cfg.temperature}`);

	const result = await playMatchup(
		() => createAgent(values.a!, cfg),
		() => createAgent(values.b!, cfg),
		gamesCount,
		seed,
		values.duplicate!,
	);

	const total = result.games.length;
	console.log(`\nResults (${total} games):`);
	console.log(
		`  ${result.agent0}: ${result.wins[0]} wins (${((result.wins[0] / total) * 100).toFixed(1)}%)`,
	);
	console.log(
		`  ${result.agent1}: ${result.wins[1]} wins (${((result.wins[1] / total) * 100).toFixed(1)}%)`,
	);

	if (values.output) {
		// Wrap in a minimal tournament result for report compatibility
		const tournament = {
			config: {
				agents: [values.a!, values.b!],
				gamesPerMatchup: gamesCount,
				duplicate: values.duplicate!,
				parallelism: 1,
				baseSeed: seed,
			},
			matchups: [result],
			startTime: new Date().toISOString(),
			endTime: new Date().toISOString(),
			totalGames: total,
		};
		const filepath = saveTournamentResult(values.output, tournament);
		console.log(`Results saved to ${filepath}`);
	}
}

async function tournamentCommand() {
	const { values } = parseArgs({
		args: process.argv.slice(2),
		options: {
			config: { type: "string" },
			models: { type: "string" },
			games: { type: "string", default: "200" },
			seed: { type: "string", default: "42" },
			duplicate: { type: "boolean", default: true },
			format: { type: "string", default: "markdown" },
			output: { type: "string" },
			prompt: { type: "string", default: "standard" },
			language: { type: "string", default: "en" },
			temperature: { type: "string", default: "0.7" },
			provider: { type: "string", default: "native" },
			"results-dir": { type: "string", default: "results" },
			checkpoint: { type: "boolean", default: false },
			parallel: { type: "string" }, // Concurrency level
		},
		allowPositionals: true,
	});

	// Load from config file if provided
	let modelNames: string[];
	let gamesPerMatchup: number;
	let baseSeed: number;
	let duplicate: boolean;
	let resultsDir: string;
	let parallelism = values.parallel ? Number.parseInt(values.parallel, 10) : 1;
	const cfg = parseAgentConfig(values);

	if (values.config) {
		const raw = JSON.parse(await readFile(values.config, "utf-8"));
		modelNames = raw.agents;
		gamesPerMatchup = raw.gamesPerMatchup ?? 200;
		baseSeed = raw.baseSeed ?? 42;
		duplicate = raw.duplicate ?? true;
		resultsDir = raw.resultsDir ?? "results";
		if (raw.parallelism) parallelism = raw.parallelism;
		if (raw.provider) cfg.mode = raw.provider as ProviderMode;
		if (raw.prompt) cfg.prompt = raw.prompt;
		if (raw.language) cfg.language = raw.language;
		if (raw.temperature) cfg.temperature = raw.temperature;
	} else {
		if (!values.models) {
			console.error(
				"Usage: tournament --models <a,b,c> --games <n> [--provider vercel]\n       tournament --config tournament.json",
			);
			process.exit(1);
		}
		modelNames = values.models!.split(",").map((s) => s.trim());
		gamesPerMatchup = Number.parseInt(values.games!, 10);
		baseSeed = Number.parseInt(values.seed!, 10);
		duplicate = values.duplicate!;
		resultsDir = values["results-dir"]!;
	}

	const agents: AgentFactory[] = modelNames.map((name) => ({
		name,
		create: () => createAgent(name, cfg),
	}));

	const config: TournamentConfig = {
		agents: modelNames,
		gamesPerMatchup,
		duplicate,
		parallelism,
		baseSeed,
	};

	const totalMatchups = (modelNames.length * (modelNames.length - 1)) / 2;
	const totalGamesExpected = totalMatchups * gamesPerMatchup * (duplicate ? 2 : 1);
	console.log(`Tournament: ${modelNames.join(", ")}`);
	console.log(
		`  ${totalMatchups} matchups x ${gamesPerMatchup} games${duplicate ? " (x2 duplicate)" : ""} = ${totalGamesExpected} total games`,
	);
	console.log(`  parallelism=${parallelism} provider=${cfg.mode} prompt=${cfg.prompt} language=${cfg.language} temperature=${cfg.temperature}`);

	const checkpointDir = values.checkpoint ? `${resultsDir}/checkpoint` : undefined;
	
	const result = parallelism > 1 
		? await runTournamentParallel(agents, config, parallelism, checkpointDir)
		: await runTournament(agents, config, checkpointDir);

	// Save raw results
	const filepath = saveTournamentResult(resultsDir, result);
	console.log(`\nRaw results saved to ${filepath}`);

	// Generate report
	const report = generateReport(result);

	let output: string;
	switch (values.format) {
		case "json":
			output = reportToJSON(report);
			break;
		case "csv":
			output = reportToCSV(report);
			break;
		default:
			output = reportToMarkdown(report);
	}

	if (values.output) {
		await writeFile(values.output, output);
		console.log(`Report written to ${values.output}`);
	} else {
		console.log(output);
	}
}

async function evalCommand() {
	const { values } = parseArgs({
		args: process.argv.slice(2),
		options: {
			model: { type: "string" },
			models: { type: "string" },
			scenarios: { type: "string" },
			prompt: { type: "string", default: "standard" },
			prompt_format: { type: "string" },
			language: { type: "string", default: "en" },
			temperature: { type: "string", default: "0.7" },
			provider: { type: "string", default: "native" },
			output: { type: "string" },
			runs: { type: "string", default: "1" },
			tools: { type: "boolean", default: false },
		},
		allowPositionals: true,
	});

	if (!values.model && !values.models) {
		console.error("Usage: eval --models <a,b> [--runs 3] [--prompt_format <format>] [--language <lang>] [--output <file>]");
		process.exit(1);
	}

	const modelNames = values.models ? values.models.split(",").map(s => s.trim()) : [values.model!];
	const runs = Number.parseInt(values.runs!, 10);
	
	let scenarios = [createExampleScenario()];
	if (values.scenarios) {
		scenarios = JSON.parse(await readFile(values.scenarios, "utf-8"));
	}

	const allReports: any[] = [];
	
	for (const modelName of modelNames) {
		console.log(`Evaluating ${modelName} on ${scenarios.length} scenarios (${runs} runs)...`);
		let totalOverall = 0;
		const categoryTotals: Record<string, number> = {};
		let baseReport: any = null;
		
		for (let i = 0; i < runs; i++) {
			const cfg = parseAgentConfig({
				...values,
				prompt: values.prompt_format || values.prompt,
			});
			const agent = createAgent(modelName, cfg);
			const report = await runDiagnostics(agent, scenarios);
			totalOverall += report.overallScore;
			
			for (const [cat, score] of Object.entries(report.categoryScores)) {
				categoryTotals[cat] = (categoryTotals[cat] || 0) + score;
			}
			if (i === 0) baseReport = report;
		}

		// Average scores
		baseReport.overallScore = totalOverall / runs;
		for (const key of Object.keys(categoryTotals)) {
			baseReport.categoryScores[key] = categoryTotals[key] / runs;
		}
		
		// Flatten structure for Phase 2 expected output
		const flatReport = {
			model: modelName,
			language: values.language,
			prompt_format: values.prompt_format || values.prompt,
			overall_accuracy: baseReport.overallScore,
			...baseReport.categoryScores,
			tokens_input: 0,
			tokens_output: 0,
			latency_p50_ms: baseReport.evaluations.reduce((sum: number, e: any) => sum + e.latencyMs, 0) / baseReport.evaluations.length
		};
		
		allReports.push(flatReport);

		console.log(`\nDiagnostic Results for ${modelName}:`);
		console.log(`  Overall Score: ${(flatReport.overall_accuracy * 100).toFixed(1)}%`);
		for (const [cat, score] of Object.entries(baseReport.categoryScores)) {
			console.log(`  - ${cat}: ${(score as number * 100).toFixed(1)}%`);
		}
	}

	if (values.output) {
		await writeFile(values.output, JSON.stringify(allReports, null, 2));
		console.log(`Diagnostic report saved to ${values.output}`);
	}
}

async function reportCommand() {
	const { values } = parseArgs({
		args: process.argv.slice(2),
		options: {
			input: { type: "string" },
			format: { type: "string", default: "markdown" },
			output: { type: "string" },
		},
		allowPositionals: true,
	});

	if (!values.input) {
		console.error("Usage: report --input <path> --format <json|csv|markdown>");
		process.exit(1);
	}

	const raw = await readFile(values.input!, "utf-8");
	const tournament = JSON.parse(raw);
	const report = generateReport(tournament);

	let output: string;
	switch (values.format) {
		case "json":
			output = reportToJSON(report);
			break;
		case "csv":
			output = reportToCSV(report);
			break;
		default:
			output = reportToMarkdown(report);
	}

	if (values.output) {
		await writeFile(values.output, output);
		console.log(`Report written to ${values.output}`);
	} else {
		console.log(output);
	}
}

// Main dispatch
const command = process.argv[2];
switch (command) {
	case "run":
		process.argv.splice(2, 1);
		runCommand().catch(console.error);
		break;
	case "tournament":
		process.argv.splice(2, 1);
		tournamentCommand().catch(console.error);
		break;
	case "eval":
		process.argv.splice(2, 1);
		evalCommand().catch(console.error);
		break;
	case "report":
		process.argv.splice(2, 1);
		reportCommand().catch(console.error);
		break;
	case "leaderboard":
		process.argv.splice(2, 1);
		reportCommand().catch(console.error);
		break;
	default:
		console.log("TrucoBench CLI\n");
		console.log("Commands:");
		console.log("  run           Run a single matchup");
		console.log("  tournament    Run a round-robin tournament");
		console.log("  eval          Run diagnostic scenarios on a model");
		console.log("  report        Generate report from saved results");
		console.log("  leaderboard   Alias for report --format markdown\n");
		console.log("Run options:");
		console.log("  --a <agent>          First agent");
		console.log("  --b <agent>          Second agent");
		console.log("  --games <n>          Games to play (default: 10)");
		console.log("  --prompt <variant>   minimal|standard|verbose (default: standard)");
		console.log("  --language <lang>    en|pt (default: en)");
		console.log("  --temperature <t>    LLM temperature (default: 0.7)");
		console.log("  --duplicate          Play each game twice with swapped hands");
		console.log("  --output <dir>       Save results to directory\n");
		console.log("Tournament options:");
		console.log("  --config <file>      Load config from JSON file");
		console.log("  --models <a,b,c>     Comma-separated agent names");
		console.log("  --parallel <n>       Concurrency level (default: 1)");
		console.log("  --checkpoint         Enable checkpoint/resume");
		console.log("  --results-dir <dir>  Results directory (default: results)\n");
		console.log("Eval options:");
		console.log("  --model <agent>      Model to evaluate");
		console.log("  --scenarios <file>   JSON file with scenarios (default: example)");
		console.log("  --output <file>      Save diagnostic report\n");
		console.log("Examples:");
		console.log("  bun run packages/cli/src/index.ts run --a random --b heuristic --games 100");
		console.log("  bun run packages/cli/src/index.ts eval --model gpt-4o");
		console.log("  bun run packages/cli/src/index.ts tournament --models random,heuristic --parallel 4");
}
