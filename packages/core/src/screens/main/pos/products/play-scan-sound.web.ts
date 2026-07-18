// Web + Electron scan sounds. Tones are synthesised with the Web Audio API so
// no audio asset ships in the browser bundle. Everything is best-effort and
// swallows errors: a missing/blocked AudioContext must never break a scan.

interface MinimalAudioContext {
	readonly currentTime: number;
	readonly state: string;
	readonly destination: AudioNode;
	resume: () => Promise<void>;
	createOscillator: () => OscillatorNode;
	createGain: () => GainNode;
}

type AudioContextCtor = new () => MinimalAudioContext;

interface Segment {
	freq: number;
	duration: number;
	type?: OscillatorType;
}

const PEAK_GAIN = 0.15;

let sharedContext: MinimalAudioContext | null = null;

function getContext(): MinimalAudioContext | null {
	if (typeof window === 'undefined') {
		return null;
	}
	const win = window as unknown as {
		AudioContext?: AudioContextCtor;
		webkitAudioContext?: AudioContextCtor;
	};
	const Ctor = win.AudioContext ?? win.webkitAudioContext;
	if (!Ctor) {
		return null;
	}
	if (!sharedContext) {
		sharedContext = new Ctor();
	}
	return sharedContext;
}

function scheduleTones(context: MinimalAudioContext, segments: Segment[]): void {
	// Read currentTime here (not before an async resume) so the schedule starts
	// from the moment the context is actually running.
	let start = context.currentTime;
	for (const segment of segments) {
		const oscillator = context.createOscillator();
		const gain = context.createGain();
		oscillator.type = segment.type ?? 'sine';
		oscillator.frequency.value = segment.freq;
		const end = start + segment.duration;
		// Short ramps top and tail each tone so it doesn't click.
		gain.gain.setValueAtTime(0, start);
		gain.gain.linearRampToValueAtTime(PEAK_GAIN, start + 0.01);
		gain.gain.linearRampToValueAtTime(0, end);
		oscillator.connect(gain).connect(context.destination);
		oscillator.start(start);
		oscillator.stop(end + 0.02);
		start = end;
	}
}

function playTones(segments: Segment[]): void {
	const context = getContext();
	if (!context) {
		return;
	}
	// Autoplay policies suspend the context until a user gesture; a hardware scan
	// usually follows one. Schedule only once it's running so no tone is clipped.
	if (context.state === 'suspended') {
		void context
			.resume()
			.then(() => scheduleTones(context, segments))
			.catch(() => undefined);
		return;
	}
	scheduleTones(context, segments);
}

/** Bright rising two-note blip for a product added to the cart. */
export function playScanSuccess(): void {
	try {
		playTones([
			{ freq: 880, duration: 0.06 },
			{ freq: 1320, duration: 0.09 },
		]);
	} catch {
		// best-effort
	}
}

/** Low descending buzz for a scan that didn't cleanly add a product. */
export function playScanFailure(): void {
	try {
		playTones([
			{ freq: 330, duration: 0.11, type: 'square' },
			{ freq: 220, duration: 0.13, type: 'square' },
		]);
	} catch {
		// best-effort
	}
}
