export { playGame, playMatchup, runTournament, runTournamentParallel } from "./runner.ts";
export type { AgentFactory } from "./runner.ts";
export { Checkpoint, saveTournamentResult } from "./checkpoint.ts";
export { computeAgentMetrics, computeMatchupStats } from "./metrics.ts";
export type { AgentMetrics } from "./metrics.ts";
export { computeElo } from "./elo.ts";
export type { EloRating } from "./elo.ts";
export { classifyReasoning, analyzeTraces, ReasoningPattern } from "./traces.ts";
export type { TraceAnalysis } from "./traces.ts";
export { computeCost } from "./cost.ts";
export type { CostMetrics } from "./cost.ts";
export {
	generateReport,
	reportToJSON,
	reportToCSV,
	reportToMarkdown,
} from "./report.ts";
export type { FullReport } from "./report.ts";
export { runDiagnostics, createExampleScenario } from "./diagnostics.ts";
export type { DiagnosticScenario, DiagnosticReport, ScenarioEvaluation } from "./diagnostics.ts";
export type {
	GameRecord,
	RoundRecord,
	ActionRecord,
	EscalationEvent,
	MatchupResult,
	TournamentConfig,
	TournamentResult,
} from "./types.ts";
