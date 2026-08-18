// Web + Electron scan sounds. Tones are synthesised with the Web Audio API so
// no audio asset ships in the browser bundle. Everything is best-effort and
// swallows errors: a missing/blocked AudioContext must never break a scan.

import {
	clampScanSoundVolume,
	normalizeScanSoundTheme,
	type PlayScanSoundOptions,
	SCAN_SOUND_TONES,
	type ToneSegment,
} from './scan-sound-themes';

interface MinimalAudioContext {
	readonly currentTime: number;
	readonly state: string;
	readonly destination: AudioNode;
	resume: () => Promise<void>;
	createOscillator: () => OscillatorNode;
	createGain: () => GainNode;
}

type AudioContextCtor = new () => MinimalAudioContext;

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

function scheduleTones(
	context: MinimalAudioContext,
	segments: ToneSegment[],
	peakGain: number
): void {
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
		gain.gain.linearRampToValueAtTime(peakGain, start + 0.01);
		gain.gain.linearRampToValueAtTime(0, end);
		oscillator.connect(gain).connect(context.destination);
		oscillator.start(start);
		oscillator.stop(end + 0.02);
		start = end;
	}
}

function playTones(segments: ToneSegment[], peakGain: number): void {
	const context = getContext();
	if (!context) {
		return;
	}
	// Autoplay policies suspend the context until a user gesture; a hardware scan
	// usually follows one. Schedule only once it's running so no tone is clipped.
	if (context.state === 'suspended') {
		void context
			.resume()
			.then(() => scheduleTones(context, segments, peakGain))
			.catch(() => undefined);
		return;
	}
	scheduleTones(context, segments, peakGain);
}

/** Success tone for a product added to the cart (theme-dependent). */
export function playScanSuccess(options: PlayScanSoundOptions = {}): void {
	try {
		const theme = normalizeScanSoundTheme(options.theme);
		playTones(SCAN_SOUND_TONES[theme].success, clampScanSoundVolume(options.volume));
	} catch {
		// best-effort
	}
}

/** Failure tone for a scan that didn't cleanly add a product (theme-dependent). */
export function playScanFailure(options: PlayScanSoundOptions = {}): void {
	try {
		const theme = normalizeScanSoundTheme(options.theme);
		playTones(SCAN_SOUND_TONES[theme].failure, clampScanSoundVolume(options.volume));
	} catch {
		// best-effort
	}
}

/** No haptics on web — parity export so callers stay platform-agnostic. */
export function playScanFailureHaptic(): void {}
