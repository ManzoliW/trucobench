import { parseArgs } from "node:util";
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
} from "@trucobench/agents";
import {
	type AgentFactory,
	type TournamentConfig,
	generateReport,
	playMatchup,
	reportToCSV,
	reportToJSON,
	reportToMarkdown,
	runTournament,
	saveTournamentResult,
} from "@trucobench/bench";

interface AgentConfig {
	prompt: PromptVariant;
	language: PromptLanguage;
	temperature: number;
}

function createAgent(name: string, cfg: AgentConfig): Agent {
	if (name === "random") return new RandomAgent();
	if (name === "heuristic") return new HeuristicAgent();

	const promptOptions: PromptOptions = { variant: cfg.prompt, language: cfg.language };

	function llm(provider: LLMProvider): Agent {
		return new LLMAgent({
			provider: new RetryProvider(provider),
			promptOptions,
			temperature: cfg.temperature,
		});
	}

	const providerMap: Record<string, () => Agent> = {
		"gpt-4o": () => llm(new OpenAIProvider("gpt-4o")),
		"gpt-4o-mini": () => llm(new OpenAIProvider("gpt-4o-mini")),
		"claude-sonnet-4.6": () => llm(new AnthropicProvider("claude-sonnet-4-6-20260327")),
		"claude-haiku-4.5": () => llm(new AnthropicProvider("claude-haiku-4-5-20251001")),
		"gemini-2.5-pro": () => llm(new GoogleProvider("gemini-2.5-pro")),
		"gemini-2.5-flash": () => llm(new GoogleProvider("gemini-2.5-flash")),
		"deepseek-r1": () => llm(new DeepSeekProvider("deepseek-reasoner")),
	};

	const factory = providerMap[name];
	if (factory) return factory();

	if (name.startsWith("ollama/")) {
		const model = name.slice(7);
		return llm(new OllamaProvider(model));
	}

	throw new Error(
		`Unknown agent: ${name}. Available: random, heuristic, ${Object.keys(providerMap).join(", ")}, ollama/<model>`,
	);
}

function parseAgentConfig(values: Record<string, string | boolean | undefined>): AgentConfig {
	return {
		prompt: (values.prompt as PromptVariant) || "standard",
		language: (values.language as PromptLanguage) || "en",
		temperature: Number.parseFloat((values.temperature as string) || "0.7"),
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
			output: { type: "string" },
		},
		allowPositionals: true,
	});

	if (!values.a || !values.b) {
		console.error(
			"Usage: run --a <agent> --b <agent> [--games N] [--prompt standard] [--language en] [--temperature 0.7]",
		);
		process.exit(1);
	}

	const cfg = parseAgentConfig(values);
	const gamesCount = Number.parseInt(values.games!, 10);
	const seed = Number.parseInt(values.seed!, 10);

	console.log(`Running ${gamesCount} games: ${values.a} vs ${values.b}`);
	console.log(`  prompt=${cfg.prompt} language=${cfg.language} temperature=${cfg.temperature}`);

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
			"results-dir": { type: "string", default: "results" },
			checkpoint: { type: "boolean", default: false },
		},
		allowPositionals: true,
	});

	// Load from config file if provided
	let modelNames: string[];
	let gamesPerMatchup: number;
	let baseSeed: number;
	let duplicate: boolean;
	let resultsDir: string;
	const cfg = parseAgentConfig(values);

	if (values.config) {
		const raw = await Bun.file(values.config).json();
		modelNames = raw.agents;
		gamesPerMatchup = raw.gamesPerMatchup ?? 200;
		baseSeed = raw.baseSeed ?? 42;
		duplicate = raw.duplicate ?? true;
		resultsDir = raw.resultsDir ?? "results";
		if (raw.prompt) cfg.prompt = raw.prompt;
		if (raw.language) cfg.language = raw.language;
		if (raw.temperature) cfg.temperature = raw.temperature;
	} else {
		if (!values.models) {
			console.error(
				"Usage: tournament --models <a,b,c> --games <n>\n       tournament --config tournament.json",
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
		parallelism: 1,
		baseSeed,
	};

	const totalMatchups = (modelNames.length * (modelNames.length - 1)) / 2;
	const totalGamesExpected = totalMatchups * gamesPerMatchup * (duplicate ? 2 : 1);
	console.log(`Tournament: ${modelNames.join(", ")}`);
	console.log(
		`  ${totalMatchups} matchups x ${gamesPerMatchup} games${duplicate ? " (x2 duplicate)" : ""} = ${totalGamesExpected} total games`,
	);
	console.log(`  prompt=${cfg.prompt} language=${cfg.language} temperature=${cfg.temperature}`);

	const checkpointDir = values.checkpoint ? `${resultsDir}/checkpoint` : undefined;
	const result = await runTournament(agents, config, checkpointDir);

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
		await Bun.write(values.output, output);
		console.log(`Report written to ${values.output}`);
	} else {
		console.log(output);
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

	const raw = await Bun.file(values.input!).text();
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
		await Bun.write(values.output, output);
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
		console.log("  --checkpoint         Enable checkpoint/resume");
		console.log("  --results-dir <dir>  Results directory (default: results)\n");
		console.log("Examples:");
		console.log("  bun run packages/cli/src/index.ts run --a random --b heuristic --games 100");
		console.log("  bun run packages/cli/src/index.ts tournament --config tournament.example.json");
		console.log(
			"  bun run packages/cli/src/index.ts tournament --models random,heuristic --games 50",
		);
		console.log("  bun run packages/cli/src/index.ts report --input results/tournament-*.json");
}
