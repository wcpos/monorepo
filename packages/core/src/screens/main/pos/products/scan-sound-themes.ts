/**
 * Scan-feedback sound themes. Each theme is a pair of tone tables — web/Electron
 * synthesise them with the Web Audio API (no assets), native plays the matching
 * WAV pair in `./assets` (generated from these same tables, so the platforms
 * sound alike).
 */

export type ScanSoundTheme = 'classic' | 'checkout' | 'soft';

export const SCAN_SOUND_THEMES: ScanSoundTheme[] = ['classic', 'checkout', 'soft'];

export const DEFAULT_SCAN_SOUND_THEME: ScanSoundTheme = 'classic';
export const DEFAULT_SCAN_SOUND_VOLUME = 0.15;
export const MIN_SCAN_SOUND_VOLUME = 0.05;
export const MAX_SCAN_SOUND_VOLUME = 0.4;

export interface ToneSegment {
	freq: number;
	duration: number;
	type?: OscillatorType;
}

export const SCAN_SOUND_TONES: Record<
	ScanSoundTheme,
	{ success: ToneSegment[]; failure: ToneSegment[] }
> = {
	// Bright rising two-note blip / low descending square buzz (the 1.10 originals).
	classic: {
		success: [
			{ freq: 880, duration: 0.06 },
			{ freq: 1320, duration: 0.09 },
		],
		failure: [
			{ freq: 330, duration: 0.11, type: 'square' },
			{ freq: 220, duration: 0.13, type: 'square' },
		],
	},
	// Supermarket-style flat beep / double low tone.
	checkout: {
		success: [{ freq: 1000, duration: 0.12, type: 'triangle' }],
		failure: [
			{ freq: 240, duration: 0.09, type: 'square' },
			{ freq: 240, duration: 0.09, type: 'square' },
		],
	},
	// Gentle chime / muted knock — for quiet shops.
	soft: {
		success: [
			{ freq: 660, duration: 0.09 },
			{ freq: 990, duration: 0.14 },
		],
		failure: [{ freq: 180, duration: 0.16 }],
	},
};

export function normalizeScanSoundTheme(value: unknown): ScanSoundTheme {
	return SCAN_SOUND_THEMES.includes(value as ScanSoundTheme)
		? (value as ScanSoundTheme)
		: DEFAULT_SCAN_SOUND_THEME;
}

export function clampScanSoundVolume(value: unknown): number {
	const volume = typeof value === 'number' && Number.isFinite(value) ? value : NaN;
	if (Number.isNaN(volume)) {
		return DEFAULT_SCAN_SOUND_VOLUME;
	}
	return Math.min(MAX_SCAN_SOUND_VOLUME, Math.max(MIN_SCAN_SOUND_VOLUME, volume));
}

export interface PlayScanSoundOptions {
	theme?: ScanSoundTheme;
	/** Playback gain, clamped to [MIN, MAX]. */
	volume?: number;
	/** Failure only: fire the native error haptic (no-op on web). */
	haptic?: boolean;
}
