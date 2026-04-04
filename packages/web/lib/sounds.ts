"use client";

/**
 * Synthesized game audio using Web Audio API.
 * No external audio files — all sounds generated with oscillators + noise.
 * Muted by default; user toggles via UI.
 */

let ctx: AudioContext | null = null;
let muted = true;

function getCtx(): AudioContext {
	if (!ctx) ctx = new AudioContext();
	if (ctx.state === "suspended") ctx.resume();
	return ctx;
}

/** Master mute state */
export function isMuted(): boolean {
	return muted;
}

export function setMuted(m: boolean): void {
	muted = m;
	if (typeof window !== "undefined") {
		localStorage.setItem("trucobench-muted", String(m));
	}
}

export function loadMuteState(): boolean {
	if (typeof window === "undefined") return true;
	const stored = localStorage.getItem("trucobench-muted");
	muted = stored === null ? true : stored === "true";
	return muted;
}

/* ── Primitive helpers ──────────────────────────────── */

function playTone(
	freq: number,
	duration: number,
	type: OscillatorType = "sine",
	volume = 0.15,
	delay = 0,
) {
	if (muted) return;
	const ac = getCtx();
	const osc = ac.createOscillator();
	const gain = ac.createGain();
	osc.type = type;
	osc.frequency.value = freq;
	gain.gain.setValueAtTime(volume, ac.currentTime + delay);
	gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + delay + duration);
	osc.connect(gain).connect(ac.destination);
	osc.start(ac.currentTime + delay);
	osc.stop(ac.currentTime + delay + duration + 0.05);
}

function playNoise(duration: number, volume = 0.08, delay = 0) {
	if (muted) return;
	const ac = getCtx();
	const bufferSize = ac.sampleRate * duration;
	const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
	const data = buffer.getChannelData(0);
	for (let i = 0; i < bufferSize; i++) {
		data[i] = Math.random() * 2 - 1;
	}
	const source = ac.createBufferSource();
	source.buffer = buffer;
	const gain = ac.createGain();
	// Bandpass to make it sound like a card
	const filter = ac.createBiquadFilter();
	filter.type = "bandpass";
	filter.frequency.value = 2000;
	filter.Q.value = 0.5;
	gain.gain.setValueAtTime(volume, ac.currentTime + delay);
	gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + delay + duration);
	source.connect(filter).connect(gain).connect(ac.destination);
	source.start(ac.currentTime + delay);
}

/* ── Game sounds ────────────────────────────────────── */

/** Card placed on table */
export function playCardPlace() {
	playNoise(0.08, 0.12);
	playTone(180, 0.06, "triangle", 0.05);
}

/** Cards being dealt (staggered) */
export function playCardDeal(index: number) {
	const delay = index * 0.07;
	playNoise(0.05, 0.08, delay);
	playTone(300 + index * 40, 0.04, "sine", 0.04, delay);
}

/** Shuffle sound before deal */
export function playShuffle() {
	for (let i = 0; i < 6; i++) {
		playNoise(0.04, 0.06, i * 0.05);
	}
}

/** TRUCO! call — dramatic rising tone */
export function playTruco() {
	if (muted) return;
	const ac = getCtx();
	const osc = ac.createOscillator();
	const gain = ac.createGain();
	osc.type = "sawtooth";
	osc.frequency.setValueAtTime(200, ac.currentTime);
	osc.frequency.exponentialRampToValueAtTime(500, ac.currentTime + 0.15);
	osc.frequency.exponentialRampToValueAtTime(600, ac.currentTime + 0.3);
	gain.gain.setValueAtTime(0.12, ac.currentTime);
	gain.gain.setValueAtTime(0.12, ac.currentTime + 0.25);
	gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.5);
	osc.connect(gain).connect(ac.destination);
	osc.start();
	osc.stop(ac.currentTime + 0.55);
}

/** Escalation raise (SEIS/NOVE/DOZE) — higher, more intense */
export function playRaise() {
	if (muted) return;
	const ac = getCtx();
	const osc = ac.createOscillator();
	const gain = ac.createGain();
	osc.type = "sawtooth";
	osc.frequency.setValueAtTime(350, ac.currentTime);
	osc.frequency.exponentialRampToValueAtTime(800, ac.currentTime + 0.2);
	gain.gain.setValueAtTime(0.14, ac.currentTime);
	gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.4);
	osc.connect(gain).connect(ac.destination);
	osc.start();
	osc.stop(ac.currentTime + 0.45);
}

/** Accept stakes */
export function playAccept() {
	playTone(440, 0.1, "sine", 0.1);
	playTone(550, 0.1, "sine", 0.1, 0.08);
}

/** Fold — descending tone */
export function playFold() {
	playTone(400, 0.15, "triangle", 0.1);
	playTone(250, 0.2, "triangle", 0.08, 0.1);
}

/** Trick won — bright ascending */
export function playTrickWin() {
	playTone(523, 0.12, "sine", 0.1);
	playTone(659, 0.12, "sine", 0.1, 0.1);
	playTone(784, 0.15, "sine", 0.08, 0.2);
}

/** Trick lost — soft descending */
export function playTrickLoss() {
	playTone(400, 0.15, "sine", 0.06);
	playTone(350, 0.2, "sine", 0.05, 0.12);
}

/** Round won — fanfare */
export function playRoundWin() {
	playTone(523, 0.1, "square", 0.08);
	playTone(659, 0.1, "square", 0.08, 0.1);
	playTone(784, 0.1, "square", 0.08, 0.2);
	playTone(1047, 0.2, "square", 0.1, 0.3);
}

/** Game won — triumph */
export function playGameWin() {
	const notes = [523, 659, 784, 1047, 784, 1047, 1319];
	for (let i = 0; i < notes.length; i++) {
		playTone(notes[i]!, 0.15, "square", 0.09, i * 0.12);
	}
}

/** Game lost — somber */
export function playGameLoss() {
	playTone(392, 0.25, "sine", 0.08);
	playTone(349, 0.25, "sine", 0.07, 0.2);
	playTone(330, 0.3, "sine", 0.06, 0.4);
	playTone(262, 0.4, "sine", 0.05, 0.6);
}

/** Timer warning tick (last 10 seconds) */
export function playTimerTick() {
	playTone(800, 0.04, "square", 0.06);
}

/** Timer critical (last 5 seconds) */
export function playTimerCritical() {
	playTone(1000, 0.06, "square", 0.1);
}

/** Signal sent/received */
export function playSignal() {
	playTone(660, 0.06, "sine", 0.06);
	playTone(880, 0.08, "sine", 0.06, 0.06);
}

/** Chat message received */
export function playChatPing() {
	playTone(1200, 0.05, "sine", 0.04);
}
