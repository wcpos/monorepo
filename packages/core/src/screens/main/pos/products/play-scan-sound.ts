// Native (iOS/Android) scan sounds. Short WAV assets — one pair per theme,
// generated from the same tone tables the web build synthesises — are played
// with expo-audio; a failure can additionally fire an error haptic.
//
// expo-audio / expo-haptics are pulled in lazily inside the play functions so
// merely importing this module (e.g. Jest coverage instrumentation) never loads
// their native TS. Everything is best-effort — audio must never break a scan.

import {
	clampScanSoundVolume,
	normalizeScanSoundTheme,
	type PlayScanSoundOptions,
	type ScanSoundTheme,
} from './scan-sound-themes';

interface NativeAudioPlayer {
	seekTo: (seconds: number) => void;
	play: () => void;
	volume: number;
}

const players = new Map<string, NativeAudioPlayer>();

// Metro resolves require() calls with literal paths only, so the theme → asset
// mapping is spelled out rather than computed.
function getAsset(theme: ScanSoundTheme, kind: 'success' | 'failure'): unknown {
	if (kind === 'success') {
		if (theme === 'checkout') return require('./assets/scan-success-checkout.wav');
		if (theme === 'soft') return require('./assets/scan-success-soft.wav');
		return require('./assets/scan-success.wav');
	}
	if (theme === 'checkout') return require('./assets/scan-failure-checkout.wav');
	if (theme === 'soft') return require('./assets/scan-failure-soft.wav');
	return require('./assets/scan-failure.wav');
}

function play(kind: 'success' | 'failure', options: PlayScanSoundOptions): void {
	try {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { createAudioPlayer } = require('expo-audio');
		const theme = normalizeScanSoundTheme(options.theme);
		const cacheKey = `${theme}:${kind}`;
		let player = players.get(cacheKey);
		if (!player) {
			player = createAudioPlayer(getAsset(theme, kind)) as NativeAudioPlayer;
			players.set(cacheKey, player);
		}
		if (player) {
			player.volume = clampScanSoundVolume(options.volume);
			// Rewind so rapid consecutive scans each get a full sound.
			player.seekTo(0);
			player.play();
		}
	} catch {
		// best-effort
	}
}

/** Success sound for a product added to the cart (theme-dependent). */
export function playScanSuccess(options: PlayScanSoundOptions = {}): void {
	play('success', options);
}

/** Failure sound for a scan that didn't cleanly add a product, plus an error haptic unless disabled. */
export function playScanFailure(options: PlayScanSoundOptions = {}): void {
	play('failure', options);
	if (options.haptic === false) {
		return;
	}
	playScanFailureHaptic();
}

/** The error haptic alone — for stations with the failure sound off but vibration on. */
export function playScanFailureHaptic(): void {
	try {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const Haptics = require('expo-haptics');
		void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
	} catch {
		// best-effort
	}
}
