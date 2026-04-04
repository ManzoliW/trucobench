import { type GameConfig, createGame, runGame } from "@/lib/game-manager";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
	const body = (await request.json()) as GameConfig;

	const session = await createGame(body);

	// Start game loop in background (non-blocking)
	runGame(session).catch(console.error);

	return NextResponse.json({ id: session.id });
}
