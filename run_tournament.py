import sys
import subprocess
import argparse

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--models", nargs="+", default=[])
    parser.add_argument("--games_per_pair", default="200")
    parser.add_argument("--variant", default="paulista")
    parser.add_argument("--mode", default="")
    parser.add_argument("--top_n", default="")
    parser.add_argument("--elo_start", default="")
    parser.add_argument("--elo_k", default="")
    parser.add_argument("--output", required=True)
    
    args = parser.parse_args()
    
    models = args.models
    if args.top_n:
        # Phase 4 mode: Find top N models from results
        import json, os, glob
        
        # Load results to find top 5
        model_scores = {}
        for root, dirs, files in os.walk("results"):
            for file in files:
                if "diagnostic" in file and file.endswith(".json"):
                    with open(os.path.join(root, file)) as f:
                        try:
                            data = json.load(f)
                            if isinstance(data, list):
                                for d in data:
                                    if "overall_accuracy" in d:
                                        m = d["model"]
                                        if m not in model_scores or d["overall_accuracy"] > model_scores[m]:
                                            model_scores[m] = d["overall_accuracy"]
                            elif isinstance(data, dict) and "overallScore" in data:
                                m = data["modelName"]
                                if m not in model_scores or data["overallScore"] > model_scores[m]:
                                    model_scores[m] = data["overallScore"]
                        except:
                            pass
        
        # Sort and pick top N
        sorted_models = sorted(model_scores.keys(), key=lambda x: model_scores[x], reverse=True)
        models = sorted_models[:int(args.top_n)]
        print(f"Auto-selected top {args.top_n} models: {models}")
    
    # Map to bun run
    # bun run packages/cli/src/index.ts tournament --models a,b,c --games 100 --format json --output file --parallel 4
    
    cmd = [
        "bun", "run", "packages/cli/src/index.ts", "tournament",
        "--models", ",".join(models),
        "--games", args.games_per_pair,
        "--format", "json",
        "--output", args.output,
        "--parallel", "4"
    ]
    subprocess.run(cmd, check=True)
    
    # If round_robin / elo mode, we need to generate elo_leaderboard.json and game_log.jsonl and cost_efficiency.csv
    # But wait, the tournament output is a tournament JSON. 
    # Let's create a script that parses the tournament JSON and creates those specific outputs if needed.
    if args.mode == "round_robin":
        subprocess.run(["bun", "run", "scripts/generate_elo.ts", args.output, args.elo_start, args.elo_k], check=True)

if __name__ == "__main__":
    main()
