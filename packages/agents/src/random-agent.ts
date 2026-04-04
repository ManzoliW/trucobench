import type { Action, Observation } from "@trucobench/engine";
import type { Agent } from "./base-agent.ts";

export class RandomAgent implements Agent {
	readonly name = "random";

	async getAction(observation: Observation): Promise<Action> {
		const actions = observation.legalActions;
		return actions[Math.floor(Math.random() * actions.length)]!;
	}
}
