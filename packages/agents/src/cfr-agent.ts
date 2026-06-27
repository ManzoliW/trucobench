import { spawn, type ChildProcess } from "node:child_process";
import { createInterface, type Interface } from "node:readline";
import type { Action, Observation } from "@trucobench/engine";
import type { Agent } from "./base-agent.ts";

export class CFRAgent implements Agent {
	readonly name = "cfr";
	private child: ChildProcess | null = null;
	private rl: Interface | null = null;
	private strategyPath: string;
	private epsilon: number;
	
	private pendingResolve: ((value: Action) => void) | null = null;
	private pendingReject: ((reason: any) => void) | null = null;

	constructor(strategyPath: string, epsilon = 0.05) {
		this.strategyPath = strategyPath;
		this.epsilon = epsilon;
	}

	private ensureProcess(): void {
		if (this.child) return;

		const pythonCmd = process.env.PYTHON_PATH || "python";
		this.child = spawn(pythonCmd, [
			"scripts/cfr/cfr_agent_server.py",
			"--strategy",
			this.strategyPath,
			"--epsilon",
			this.epsilon.toString()
		], {
			cwd: process.cwd(),
			stdio: ["pipe", "pipe", "pipe"]
		});

		this.child.stderr?.on("data", (data) => {
			console.error(`[CFR Agent Server] ${data.toString().trim()}`);
		});

		this.rl = createInterface({
			input: this.child.stdout!,
			terminal: false
		});

		this.rl.on("line", (line) => {
			if (this.pendingResolve) {
				try {
					const action = JSON.parse(line) as Action;
					const resolve = this.pendingResolve;
					this.pendingResolve = null;
					this.pendingReject = null;
					resolve(action);
				} catch (err) {
					console.error("[CFRAgent] Error parsing action from server:", err);
					const reject = this.pendingReject;
					this.pendingResolve = null;
					this.pendingReject = null;
					reject?.(err);
				}
			}
		});

		this.child.on("close", (code) => {
			if (code !== 0 && code !== null) {
				console.error(`[CFRAgent] Subprocess exited with code ${code}`);
			}
			this.cleanup();
		});

		this.child.on("error", (err) => {
			console.error("[CFRAgent] Subprocess error:", err);
			if (this.pendingReject) {
				const reject = this.pendingReject;
				this.pendingResolve = null;
				this.pendingReject = null;
				reject(err);
			}
			this.cleanup();
		});
	}

	private cleanup(): void {
		if (this.rl) {
			this.rl.close();
			this.rl = null;
		}
		if (this.child) {
			this.child.kill();
			this.child = null;
		}
	}

	async getAction(observation: Observation): Promise<Action> {
		this.ensureProcess();

		if (!this.child || !this.child.stdin) {
			throw new Error("CFR subprocess is not running or has no stdin");
		}

		if (this.pendingResolve) {
			throw new Error("CFRAgent only supports sequential getAction calls");
		}

		return new Promise<Action>((resolve, reject) => {
			this.pendingResolve = resolve;
			this.pendingReject = reject;

			const payload = JSON.stringify(observation) + "\n";
			this.child!.stdin!.write(payload, (err) => {
				if (err) {
					this.pendingResolve = null;
					this.pendingReject = null;
					reject(err);
				}
			});
		});
	}

	close(): void {
		this.cleanup();
	}
}
