import type { Action, Observation, PlayerId, GameState } from "@trucobench/engine";
import type { Agent, LLMAgent } from "@trucobench/agents";

export interface DiagnosticScenario {
    id: string;
    name: string;
    description: string;
    /** The observation presented to the agent */
    observation: Observation;
    /** The "ground truth" or expert-recommended actions */
    expectedActions: {
        action: Action;
        weight: number; // 1.0 for optimal, lower for acceptable but sub-optimal
        reasoning?: string; // Why this is the correct move
    }[];
    /** Category for reporting: "bluff", "defense", "math", "signals", etc. */
    category: string;
}

export interface ScenarioEvaluation {
    scenarioId: string;
    modelName: string;
    actualAction: Action;
    actualReasoning: string;
    score: number; // Based on expectedActions weight
    latencyMs: number;
    passed: boolean;
}

export interface DiagnosticReport {
    modelName: string;
    timestamp: string;
    overallScore: number;
    categoryScores: Record<string, number>;
    evaluations: ScenarioEvaluation[];
}

function actionsEqual(a: Action, b: Action): boolean {
    if (a.type !== b.type) return false;
    if (a.type === "PLAY_CARD" && b.type === "PLAY_CARD") {
        return a.cardIndex === b.cardIndex;
    }
    return true;
}

export async function runDiagnostics(
    agent: Agent,
    scenarios: DiagnosticScenario[]
): Promise<DiagnosticReport> {
    const evaluations: ScenarioEvaluation[] = [];
    const categoryTotals: Record<string, { score: number; count: number }> = {};

    for (const scenario of scenarios) {
        const startTime = performance.now();
        let action: Action;
        let latencyMs = 0;
        let reasoning = "";
        
        try {
            const timeout = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error("Timeout getting action")), 30000);
            });
            action = await Promise.race([agent.getAction(scenario.observation), timeout]);
            latencyMs = performance.now() - startTime;
            if ("lastTrace" in agent && (agent as any).lastTrace) {
                reasoning = (agent as any).lastTrace.reasoning || "";
            }
        } catch (err: any) {
            console.error(`[Diagnostics] Error evaluating ${agent.name} on scenario ${scenario.id}:`, err.message || err);
            // Fallback to first legal action (simulate failure)
            action = scenario.observation.legalActions[0];
            latencyMs = performance.now() - startTime;
            reasoning = "API ERROR: " + (err.message || String(err));
        }

        const match = scenario.expectedActions.find(ea => actionsEqual(ea.action, action));
        const score = match ? match.weight : 0;
        const passed = score >= 0.8; // threshold for "passing"

        evaluations.push({
            scenarioId: scenario.id,
            modelName: agent.name,
            actualAction: action,
            actualReasoning: reasoning,
            score,
            latencyMs,
            passed
        });

        if (!categoryTotals[scenario.category]) {
            categoryTotals[scenario.category] = { score: 0, count: 0 };
        }
        categoryTotals[scenario.category].score += score;
        categoryTotals[scenario.category].count += 1;
    }

    const overallScore = evaluations.reduce((sum, e) => sum + e.score, 0) / evaluations.length;
    const categoryScores: Record<string, number> = {};
    for (const [cat, data] of Object.entries(categoryTotals)) {
        categoryScores[cat] = data.score / data.count;
    }

    return {
        modelName: agent.name,
        timestamp: new Date().toISOString(),
        overallScore,
        categoryScores,
        evaluations
    };
}

/**
 * Example scenario creator (for testing the structure)
 */
export function createExampleScenario(): DiagnosticScenario {
    return {
        id: "bluff-001",
        name: "Classic First-Trick Bluff",
        description: "You won the first trick with a weak card. Opponent played a 4. You have a 5 and a 6. Should you Truco?",
        category: "bluff",
        observation: {
            playerId: 0,
            hand: [
                { suit: "ouros", rank: "5" },
                { suit: "espadas", rank: "6" }
            ],
            vira: { suit: "copas", rank: "K" },
            score: [0, 0],
            opponentCardCount: 2,
            tricks: [
                {
                    firstPlayer: 0,
                    cards: [
                        { suit: "copas", rank: "Q" },
                        { suit: "ouros", rank: "4" }
                    ],
                    winner: 0
                }
            ],
            currentTrick: {
                firstPlayer: 0,
                firstCard: null
            },
            escalation: {
                level: "NORMAL",
                pendingRequest: null,
                requestedBy: null,
                lastEscalatedBy: null,
                initiatedBySeat: null
            },
            legalActions: [
                { type: "PLAY_CARD" as any, cardIndex: 0 },
                { type: "PLAY_CARD" as any, cardIndex: 1 },
                { type: "TRUCO" as any }
            ],
            roundNumber: 1,
            maoDeOnze: false,
            maoDeferro: false
        },
        expectedActions: [
            {
                action: { type: "TRUCO" as any },
                weight: 1.0,
                reasoning: "Winning the first trick with a weak card is the prime time to bluff in Truco Paulista."
            },
            {
                action: { type: "PLAY_CARD" as any, cardIndex: 1 },
                weight: 0.2,
                reasoning: "Playing a 6 is too weak to win the round without a bluff."
            }
        ]
    };
}
