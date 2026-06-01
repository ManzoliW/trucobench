"use client";

import {
	type Action,
	ActionType,
	FourPlayerGame,
	type FourPlayerObservation,
	Game,
	type Observation,
	type PlayerId,
	type SeatId,
	type SignalType,
	getVisibleSignals,
	teamOf,
} from "@trucobench/engine";
import { HeuristicAgent, RandomAgent, weakestLegalAction } from "@trucobench/agents";
import type { GameConfig, GameEvent, GameSnapshot, PlayerConfig } from "./game-manager";

/* ── Types ───────────────────────────────────────────── */

export type RoomRole = "host" | "guest";
export type RoomStatus = "lobby" | "playing" | "ended" | "disconnected";

export interface LobbyState {
	code: string;
	seats: (PlayerConfig | null)[];
	hostSeat: number;
	/** Map of peerId → seatIndex for remote humans */
	peerSeats: Record<string, number>;
}

/** Host → Guest */
type HostMsg =
	| { t: "lobby"; lobby: LobbyState }
	| { t: "event"; event: GameEvent }
	| { t: "your-seat"; seat: number }
	| { t: "kick"; reason: string }
	| { t: "start" };

/** Guest → Host */
type GuestMsg =
	| { t: "join"; name: string }
	| { t: "pick-seat"; seat: number }
	| { t: "action"; action: Action }
	| { t: "signal"; signalType: string }
	| { t: "chat"; text: string };

type P2PListener = (event: GameEvent) => void;
type LobbyListener = (lobby: LobbyState) => void;
type StatusListener = (status: RoomStatus) => void;

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function generateCode(): string {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ";
	let code = "";
	for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
	return `TRUCO-${code}`;
}

/* ── P2PRoom ─────────────────────────────────────────── */

export class P2PRoom {
	role: RoomRole;
	code: string;
	status: RoomStatus = "lobby";
	lobby: LobbyState;

	private peer: any = null; // Peer instance (dynamic import)
	private conns: Map<string, any> = new Map(); // peerId → DataConnection
	private eventListeners: P2PListener[] = [];
	private lobbyListeners: LobbyListener[] = [];
	private statusListeners: StatusListener[] = [];
	private pendingActions: Map<number, (a: Action) => void> = new Map(); // seat → resolver
	private destroyed = false;

	// For guest
	private hostConn: any = null;
	mySeat = -1;

	constructor(role: RoomRole, code?: string) {
		this.role = role;
		this.code = code ?? generateCode();
		this.lobby = {
			code: this.code,
			seats: [null, null, null, null],
			hostSeat: 0,
			peerSeats: {},
		};
	}

	/* ── Event subscriptions ── */

	onEvent(cb: P2PListener): () => void {
		this.eventListeners.push(cb);
		return () => {
			this.eventListeners = this.eventListeners.filter((l) => l !== cb);
		};
	}

	onLobby(cb: LobbyListener): () => void {
		this.lobbyListeners.push(cb);
		return () => {
			this.lobbyListeners = this.lobbyListeners.filter((l) => l !== cb);
		};
	}

	onStatus(cb: StatusListener): () => void {
		this.statusListeners.push(cb);
		return () => {
			this.statusListeners = this.statusListeners.filter((l) => l !== cb);
		};
	}

	private emit(event: GameEvent) {
		for (const l of this.eventListeners) l(event);
	}

	private emitLobby() {
		for (const l of this.lobbyListeners) l({ ...this.lobby });
	}

	private setStatus(s: RoomStatus) {
		this.status = s;
		for (const l of this.statusListeners) l(s);
	}

	/* ── Host: create room ── */

	async createRoom(): Promise<string> {
		const { Peer } = await import("peerjs");
		return new Promise((resolve, reject) => {
			this.peer = new Peer(this.code, { debug: 1 });

			this.peer.on("open", (id: string) => {
				this.code = id;
				this.lobby.code = id;
				// Host sits at seat 0 by default
				this.lobby.seats[0] = { type: "human", name: "Host" };
				this.lobby.hostSeat = 0;
				this.emitLobby();
				resolve(id);
			});

			this.peer.on("connection", (conn: any) => {
				conn.on("open", () => {
					this.conns.set(conn.peer, conn);
					// Send current lobby state
					this.sendTo(conn, { t: "lobby", lobby: this.lobby });
				});

				conn.on("data", (data: any) => {
					this.handleGuestMessage(conn.peer, data as GuestMsg);
				});

				conn.on("close", () => {
					this.handleGuestDisconnect(conn.peer);
				});
			});

			this.peer.on("error", (err: any) => {
				if (this.status === "lobby") reject(err);
				console.error("[p2p] Host error:", err);
			});
		});
	}

	/* ── Guest: join room ── */

	async joinRoom(): Promise<void> {
		const { Peer } = await import("peerjs");
		return new Promise((resolve, reject) => {
			this.peer = new Peer({ debug: 1 });

			this.peer.on("open", () => {
				this.hostConn = this.peer.connect(this.code, { reliable: true });

				this.hostConn.on("open", () => {
					// Send join message
					this.sendTo(this.hostConn, { t: "join", name: "Player" });
					resolve();
				});

				this.hostConn.on("data", (data: any) => {
					this.handleHostMessage(data as HostMsg);
				});

				this.hostConn.on("close", () => {
					this.setStatus("disconnected");
				});

				this.hostConn.on("error", (err: any) => {
					console.error("[p2p] Guest connection error:", err);
					reject(err);
				});
			});

			this.peer.on("error", (err: any) => {
				console.error("[p2p] Guest peer error:", err);
				reject(err);
			});
		});
	}

	/* ── Host: handle guest messages ── */

	private handleGuestMessage(peerId: string, msg: GuestMsg) {
		switch (msg.t) {
			case "join":
				// Guest connected, send lobby state
				break;

			case "pick-seat": {
				const seat = msg.seat;
				if (seat < 0 || seat > 3) return;
				if (this.lobby.seats[seat] !== null) return; // occupied

				// Remove from any previous seat
				for (let i = 0; i < 4; i++) {
					if (this.lobby.peerSeats[peerId] !== undefined && this.lobby.peerSeats[peerId] === i) {
						this.lobby.seats[i] = null;
					}
				}

				this.lobby.seats[seat] = { type: "human", name: `Player ${Object.keys(this.lobby.peerSeats).length + 1}` };
				this.lobby.peerSeats[peerId] = seat;
				this.emitLobby();
				this.broadcastToGuests({ t: "lobby", lobby: this.lobby });
				// Tell this specific guest their seat
				const conn = this.conns.get(peerId);
				if (conn) this.sendTo(conn, { t: "your-seat", seat });
				break;
			}

			case "action": {
				const seat = this.lobby.peerSeats[peerId];
				if (seat !== undefined) {
					const resolver = this.pendingActions.get(seat);
					if (resolver) {
						this.pendingActions.delete(seat);
						resolver(msg.action);
					}
				}
				break;
			}

			case "signal":
				// TODO: implement P2P signals
				break;

			case "chat":
				// Broadcast chat to all
				const chatSeat = this.lobby.peerSeats[peerId];
				if (chatSeat !== undefined) {
					const event: GameEvent = {
						type: "chat",
						data: { seat: chatSeat, name: this.lobby.seats[chatSeat]?.name ?? "?", text: msg.text },
					};
					this.emit(event);
					this.broadcastToGuests({ t: "event", event });
				}
				break;
		}
	}

	private handleGuestDisconnect(peerId: string) {
		const seat = this.lobby.peerSeats[peerId];
		if (seat !== undefined) {
			this.lobby.seats[seat] = null;
			delete this.lobby.peerSeats[peerId];
			this.emitLobby();
			this.broadcastToGuests({ t: "lobby", lobby: this.lobby });
		}
		this.conns.delete(peerId);
	}

	/* ── Guest: handle host messages ── */

	private handleHostMessage(msg: HostMsg) {
		switch (msg.t) {
			case "lobby":
				this.lobby = msg.lobby;
				this.emitLobby();
				break;
			case "your-seat":
				this.mySeat = msg.seat;
				break;
			case "event":
				this.emit(msg.event);
				break;
			case "start":
				this.setStatus("playing");
				break;
			case "kick":
				this.setStatus("disconnected");
				break;
		}
	}

	/* ── Communication helpers ── */

	private sendTo(conn: any, msg: HostMsg | GuestMsg) {
		if (conn?.open) conn.send(msg);
	}

	private broadcastToGuests(msg: HostMsg) {
		for (const conn of this.conns.values()) {
			this.sendTo(conn, msg);
		}
	}

	/* ── Guest: send action to host ── */

	sendAction(action: Action) {
		if (this.role === "guest" && this.hostConn) {
			this.sendTo(this.hostConn, { t: "action", action });
		}
	}

	sendChat(text: string) {
		if (this.role === "guest" && this.hostConn) {
			this.sendTo(this.hostConn, { t: "chat", text });
		}
	}

	sendSignal(signalType: string) {
		if (this.role === "guest" && this.hostConn) {
			this.sendTo(this.hostConn, { t: "signal", signalType });
		}
	}

	/* ── Guest: pick a seat ── */

	pickSeat(seat: number) {
		if (this.role === "guest" && this.hostConn) {
			this.sendTo(this.hostConn, { t: "pick-seat", seat });
		}
	}

	/* ── Host: fill seat with AI ── */

	fillSeatWithAI(seat: number, type: "heuristic" | "random") {
		if (this.role !== "host") return;
		if (this.lobby.seats[seat] !== null) return;
		this.lobby.seats[seat] = { type, name: type === "heuristic" ? "Bot" : "Random" };
		this.emitLobby();
		this.broadcastToGuests({ t: "lobby", lobby: this.lobby });
	}

	removeSeat(seat: number) {
		if (this.role !== "host") return;
		// Don't remove host's own seat
		if (seat === this.lobby.hostSeat) return;
		// Find and remove any peer at this seat
		for (const [peerId, s] of Object.entries(this.lobby.peerSeats)) {
			if (s === seat) {
				delete this.lobby.peerSeats[peerId];
				const conn = this.conns.get(peerId);
				if (conn) this.sendTo(conn, { t: "kick", reason: "Removed from seat" });
				break;
			}
		}
		this.lobby.seats[seat] = null;
		this.emitLobby();
		this.broadcastToGuests({ t: "lobby", lobby: this.lobby });
	}

	/* ── Host: start game ── */

	async startGame(config: Omit<GameConfig, "players" | "apiKeys">) {
		if (this.role !== "host") return;
		const seats = this.lobby.seats;
		const filledCount = seats.filter(Boolean).length;
		if (filledCount < 2) return;

		// Determine if 2P or 4P
		const is2p = seats[0] !== null && seats[1] !== null && seats[2] === null && seats[3] === null;
		const mode = is2p ? "2p" : "4p";

		// Build player configs
		const players: PlayerConfig[] = mode === "4p"
			? seats.map((s) => s ?? { type: "random", name: "Random" })
			: [seats[0]!, seats[1]!];

		const fullConfig: GameConfig = {
			...config,
			players,
			apiKeys: {},
		};

		this.setStatus("playing");
		this.broadcastToGuests({ t: "start" });

		// Create agents for non-human seats
		const agents: (HeuristicAgent | RandomAgent | null)[] = players.map((p, i) => {
			if (p.type === "heuristic") return new HeuristicAgent();
			if (p.type === "random") return new RandomAgent();
			return null; // human (local or remote)
		});

		// Run game loop
		if (mode === "2p") {
			await this.run2pGame(fullConfig, agents as (HeuristicAgent | RandomAgent | null)[]);
		} else {
			await this.run4pGame(fullConfig, agents as (HeuristicAgent | RandomAgent | null)[]);
		}

		this.setStatus("ended");
	}

	/* ── Game loops (browser-side, mirrors game-manager.ts) ── */

	private isLocalHuman(seat: number): boolean {
		return seat === this.lobby.hostSeat;
	}

	private isRemoteHuman(seat: number): boolean {
		return Object.values(this.lobby.peerSeats).includes(seat);
	}

	private emitAndBroadcast(event: GameEvent) {
		this.emit(event);
		this.broadcastToGuests({ t: "event", event });
	}

	private buildSnapshot2p(config: GameConfig, game: Game): GameSnapshot {
		return {
			mode: "2p",
			scores: [...game.state.scores] as [number, number],
			roundNumber: game.state.roundNumber,
			players: config.players,
			currentSeat: game.getCurrentPlayer(),
			winner: game.state.winner,
			observations: game.state.currentRound
				? [game.observe(0), game.observe(1)]
				: [null, null],
		};
	}

	private buildSnapshot4p(config: GameConfig, game: FourPlayerGame): GameSnapshot {
		const obs = game.state.currentRound
			? ([0, 1, 2, 3] as SeatId[]).map((s) => game.observe(s))
			: [null, null, null, null];
		return {
			mode: "4p",
			scores: [...game.state.scores] as [number, number],
			roundNumber: game.state.roundNumber,
			players: config.players,
			currentSeat: game.getCurrentSeat(),
			winner: game.state.winner,
			observations: obs,
		};
	}

	private waitForHumanAction(seat: number, timeoutMs: number): Promise<Action> {
		return new Promise<Action>((resolve) => {
			if (this.isLocalHuman(seat)) {
				// Host's own turn — wait for local submit
				this.pendingActions.set(seat, resolve);
			} else {
				// Remote guest — wait for their action message
				this.pendingActions.set(seat, resolve);
			}

			if (timeoutMs > 0) {
				setTimeout(() => {
					if (this.pendingActions.has(seat)) {
						this.pendingActions.delete(seat);
						this.emitAndBroadcast({ type: "timeout", data: { seat } });
						// Auto-fold on timeout
						resolve({ type: ActionType.FOLD });
					}
				}, timeoutMs);
			}
		});
	}

	/** Host submits their own action (called from GameBoard) */
	submitLocalAction(action: Action) {
		const resolver = this.pendingActions.get(this.lobby.hostSeat);
		if (resolver) {
			this.pendingActions.delete(this.lobby.hostSeat);
			resolver(action);
		}
	}

	private async run2pGame(config: GameConfig, agents: (HeuristicAgent | RandomAgent | null)[]) {
		const game = new Game({ trucoTiming: config.trucoTiming });
		game.reset();

		while (game.state.winner === null) {
			const pid = game.getCurrentPlayer();
			if (pid === null) break;

			const snap = this.buildSnapshot2p(config, game);
			this.emitAndBroadcast({ type: "state", data: snap });

			const agent = agents[pid];
			let action: Action;

			if (agent === null) {
				// Human turn
				this.emitAndBroadcast({ type: "waiting_human", data: { seat: pid, timeoutMs: config.turnTimeoutMs } });
				action = await this.waitForHumanAction(pid, config.turnTimeoutMs);
			} else {
				await delay(500);
				const obs = game.observe(pid);
				action = await agent.getAction(obs);
			}

			const result = game.step(pid, action);
			this.emitAndBroadcast({ type: "action", data: { seat: pid, action } });

			const postSnap = this.buildSnapshot2p(config, game);

			if (agent !== null) {
				if (action.type === ActionType.PLAY_CARD) await delay(700);
				else await delay(500);
			}

			if (result.roundDone) {
				this.emitAndBroadcast({ type: "trick_end", data: postSnap });
				await delay(1200);
				this.emitAndBroadcast({
					type: "round_end",
					data: { winner: result.roundWinner, scores: result.scores },
				});
				await delay(800);
			}

			if (result.done) {
				this.emitAndBroadcast({
					type: "game_end",
					data: { winner: result.winner, scores: result.scores },
				});
			}
		}
	}

	private async run4pGame(config: GameConfig, agents: (HeuristicAgent | RandomAgent | null)[]) {
		const game = new FourPlayerGame({ trucoTiming: config.trucoTiming });
		game.reset();

		while (game.state.winner === null) {
			let seat = game.getCurrentSeat();

			// Escalation: getCurrentSeat() returns null
			if (seat === null) {
				const round = game.state.currentRound;
				if (!round || round.escalation.pendingRequest === null) break;
				const requestingTeam = teamOf(round.escalation.requestedBy as SeatId);
				const respondingTeam = requestingTeam === 0 ? 1 : 0;
				const respondingSeats = respondingTeam === 0 ? [0, 2] : [1, 3];
				// Prefer human responder
				const humanResponder = respondingSeats.find((s) => agents[s] === null);
				seat = (humanResponder !== undefined ? humanResponder : respondingSeats[0]!) as SeatId;
			}

			const snap = this.buildSnapshot4p(config, game);
			if (snap.currentSeat === null) snap.currentSeat = seat;
			this.emitAndBroadcast({ type: "state", data: snap });

			const agent = agents[seat];
			let action: Action;

			if (agent === null) {
				this.emitAndBroadcast({ type: "waiting_human", data: { seat, timeoutMs: config.turnTimeoutMs } });
				action = await this.waitForHumanAction(seat, config.turnTimeoutMs);
			} else {
				await delay(500);
				const obs = game.observe(seat as SeatId);
				// Adapt to 2P format for heuristic/random agents
				action = await agent.getAction(obs as any);
			}

			const result = game.step(seat as SeatId, action);
			this.emitAndBroadcast({ type: "action", data: { seat, action } });

			const postSnap = this.buildSnapshot4p(config, game);

			if (agent !== null) {
				if (action.type === ActionType.PLAY_CARD) await delay(700);
				else await delay(500);
			}

			if (result.roundDone) {
				this.emitAndBroadcast({ type: "trick_end", data: postSnap });
				await delay(1200);
				this.emitAndBroadcast({
					type: "round_end",
					data: { winner: result.roundWinner, scores: result.scores },
				});
				await delay(800);
			}

			if (result.done) {
				this.emitAndBroadcast({
					type: "game_end",
					data: { winner: result.winner, scores: result.scores },
				});
			}
		}
	}

	/* ── Cleanup ── */

	destroy() {
		this.destroyed = true;
		for (const conn of this.conns.values()) {
			try { conn.close(); } catch {}
		}
		this.conns.clear();
		try { this.hostConn?.close(); } catch {}
		try { this.peer?.destroy(); } catch {}
		this.peer = null;
	}
}
