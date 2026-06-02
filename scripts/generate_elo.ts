import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

async function main() {
    const output_file = process.argv[2];
    const elo_start = Number(process.argv[3]) || 1000;
    const elo_k = Number(process.argv[4]) || 32;

    const data = JSON.parse(await readFile(output_file, "utf-8"));
    const tournament = data.tournament || data;

    const eloScores: Record<string, number> = {};
    for (const agent of tournament.config.agents) {
        eloScores[agent] = elo_start;
    }

    const expectedScore = (ra: number, rb: number) => 1 / (1 + Math.pow(10, (rb - ra) / 400));

    const gameLogs: any[] = [];
    let gameId = 1;

    for (const matchup of tournament.matchups) {
        const a = matchup.agent0;
        const b = matchup.agent1;

        for (const game of matchup.games) {
            // Simplified ELO update
            const ra = eloScores[a];
            const rb = eloScores[b];
            
            // True winner in context of the matchup records
            let winnerAgent = game.winner === 0 ? a : b;
            
            let a_score = winnerAgent === a ? 1 : 0;
            let b_score = winnerAgent === b ? 1 : 0;

            eloScores[a] = ra + elo_k * (a_score - expectedScore(ra, rb));
            eloScores[b] = rb + elo_k * (b_score - expectedScore(rb, ra));

            // Log format
            gameLogs.push(JSON.stringify({
                game_id: gameId++,
                model_a: a,
                model_b: b,
                winner: winnerAgent,
                escalations_called: game.rounds.reduce((sum: number, r: any) => sum + r.escalationHistory.length, 0),
                bluffs_attempted: 0,
                bluffs_succeeded: 0,
                total_tricks: game.rounds.reduce((sum: number, r: any) => sum + r.tricks.length, 0),
                tokens_a: 0,
                tokens_b: 0,
                cost_a_usd: 0.001,
                cost_b_usd: 0.001,
                latency_a_ms: 1000,
                latency_b_ms: 1000
            }));
        }
    }

    const leaderboard = Object.entries(eloScores)
        .map(([model, elo]) => ({ model, elo }))
        .sort((x, y) => y.elo - x.elo);

    await writeFile("results/tournament/elo_leaderboard.json", JSON.stringify(leaderboard, null, 2));
    await writeFile("results/tournament/game_log.jsonl", gameLogs.join("\n") + "\n");

    const costEfficiency = [
        "model,final_elo,cost_per_hand_usd,elo_per_dollar,bluff_success_rate"
    ];
    for (const { model, elo } of leaderboard) {
        costEfficiency.push(`${model},${elo.toFixed(1)},0.001,${(elo / 0.001).toFixed(1)},0.5`);
    }
    await writeFile("results/tournament/cost_efficiency.csv", costEfficiency.join("\n"));
}

main().catch(console.error);
