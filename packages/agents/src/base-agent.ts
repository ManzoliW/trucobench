import type { Action, Observation } from "@trucobench/engine";

export interface Agent {
	readonly name: string;
	getAction(observation: Observation): Promise<Action>;
}
