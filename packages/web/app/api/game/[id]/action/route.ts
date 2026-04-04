import { getGame, submitHumanAction } from "@/lib/game-manager";
import type { Action } from "@trucobench/engine";
import { NextResponse } from "next/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const session = getGame(id);
	if (!session) {
		return NextResponse.json({ error: "Game not found" }, { status: 404 });
	}

	const action = (await request.json()) as Action;
	const success = submitHumanAction(session, action);

	if (!success) {
		return NextResponse.json({ error: "Not waiting for human action" }, { status: 400 });
	}

	return NextResponse.json({ ok: true });
}
