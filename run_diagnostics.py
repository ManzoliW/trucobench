import sys
import subprocess
import argparse

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--prompt_format", nargs="+", default=["standard"])
    parser.add_argument("--language", default="en")
    parser.add_argument("--temperature", default="0.0")
    parser.add_argument("--runs", default="1")
    parser.add_argument("--models", nargs="+", required=True)
    parser.add_argument("--output", required=True)
    
    args = parser.parse_args()
    
    # Map to bun run
    # bun run packages/cli/src/index.ts eval --models a,b --runs 3 --prompt_format format --language lang --temperature temp --output file
    
    # If multiple prompt_formats are passed, we need to run multiple times or the CLI needs to support it.
    # Our modified eval command in CLI only takes one prompt_format and output.
    # Wait, Phase 3 passes: --prompt_format llmwiki standard
    
    if len(args.prompt_format) > 1:
        # Phase 3 mode
        import json
        import os
        
        all_results = []
        for fmt in args.prompt_format:
            tmp_out = args.output + f".{fmt}.tmp.json"
            cmd = [
                "bun", "run", "packages/cli/src/index.ts", "eval",
                "--models", ",".join(args.models),
                "--runs", args.runs,
                "--prompt_format", fmt,
                "--language", args.language,
                "--temperature", args.temperature,
                "--output", tmp_out
            ]
            subprocess.run(cmd, check=True)
            with open(tmp_out, "r") as f:
                res = json.load(f)
                all_results.extend(res)
            os.remove(tmp_out)
            
        with open(args.output, "w") as f:
            json.dump(all_results, f, indent=2)
    else:
        cmd = [
            "bun", "run", "packages/cli/src/index.ts", "eval",
            "--models", ",".join(args.models),
            "--runs", args.runs,
            "--prompt_format", args.prompt_format[0],
            "--language", args.language,
            "--temperature", args.temperature,
            "--output", args.output
        ]
        subprocess.run(cmd, check=True)

if __name__ == "__main__":
    main()
