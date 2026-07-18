// Native (iOS/Android) scan sounds. Short WAV assets are played with expo-audio
// and a failure additionally fires an error haptic (failure-only, per #717).
//
// expo-audio / expo-haptics are pulled in lazily inside the play functions so
// merely importing this module (e.g. Jest coverage instrumentation) never loads
// their native TS. Everything is best-effort — audio must never break a scan.

interface NativeAudioPlayer {
	seekTo: (seconds: number) => void;
	play: () => void;
}

let successPlayer: NativeAudioPlayer | null = null;
let failurePlayer: NativeAudioPlayer | null = null;

function replay(player: NativeAudioPlayer): void {
	// Rewind so rapid consecutive scans each get a full sound.
	player.seekTo(0);
	player.play();
}

/** Bright blip for a product added to the cart. */
export function playScanSuccess(): void {
	try {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { createAudioPlayer } = require('expo-audio');
		if (!successPlayer) {
			successPlayer = createAudioPlayer(require('./assets/scan-success.wav'));
		}
		if (successPlayer) {
			replay(successPlayer);
		}
	} catch {
		// best-effort
	}
}

/** Distinct buzz + error haptic for a scan that didn't cleanly add a product. */
export function playScanFailure(): void {
	try {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { createAudioPlayer } = require('expo-audio');
		if (!failurePlayer) {
			failurePlayer = createAudioPlayer(require('./assets/scan-failure.wav'));
		}
		if (failurePlayer) {
			replay(failurePlayer);
		}
	} catch {
		// best-effort
	}
	try {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const Haptics = require('expo-haptics');
		void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
	} catch {
		// best-effort
	}
}
