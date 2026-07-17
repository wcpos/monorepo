import * as React from 'react';
import type { NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native';

import { getKeyFromEvent, RNKeyboardEvent, useHotkeys } from '@wcpos/hooks/use-hotkeys';

import type { TraceKey } from './analyze-scan-trace';

// A scanner burst never pauses this long; a bigger gap starts a new attempt.
const ATTEMPT_GAP_MS = 1000;
// Settle time after the last key before the attempt is finalized for analysis.
const SETTLE_MS = 400;
const MAX_ATTEMPTS = 5;

/**
 * Record raw keystrokes into "attempts" (bursts separated by pauses) so the
 * test panel can chart and analyze each scan or typing attempt separately.
 */
export function useScanTraceCapture() {
	const [currentKeys, setCurrentKeys] = React.useState<TraceKey[]>([]);
	const [attempts, setAttempts] = React.useState<TraceKey[][]>([]);
	const currentRef = React.useRef<TraceKey[]>([]);
	const settleTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

	const finalizeAttempt = React.useCallback(() => {
		if (settleTimerRef.current) {
			clearTimeout(settleTimerRef.current);
			settleTimerRef.current = null;
		}
		if (currentRef.current.length === 0) {
			return;
		}
		const finished = currentRef.current;
		currentRef.current = [];
		setCurrentKeys([]);
		setAttempts((previous) => [finished, ...previous].slice(0, MAX_ATTEMPTS));
	}, []);

	const recordKey = React.useCallback(
		(key: string, timeMs: number) => {
			const last = currentRef.current[currentRef.current.length - 1];
			if (last && timeMs - last.timeMs > ATTEMPT_GAP_MS) {
				finalizeAttempt();
			}
			currentRef.current = [...currentRef.current, { key, timeMs }];
			setCurrentKeys(currentRef.current);

			if (settleTimerRef.current) {
				clearTimeout(settleTimerRef.current);
			}
			settleTimerRef.current = setTimeout(finalizeAttempt, SETTLE_MS);
		},
		[finalizeAttempt]
	);

	const onKeyboardEvent = React.useCallback(
		(keyboardEvent: KeyboardEvent) => {
			const key = getKeyFromEvent(keyboardEvent as unknown as RNKeyboardEvent);
			if (key !== null) {
				recordKey(key, Date.now());
			}
		},
		[recordKey]
	);

	// Web: a global key listener captures scans anywhere on the page.
	useHotkeys('*', onKeyboardEvent);

	// Native: `useHotkeys` is a no-op, so nothing above ever fires. A scanner on
	// a native build delivers keys through a focused TextInput's `onKeyPress`
	// (the same path the production detector uses), so expose a handler the
	// panel can wire to a capture input. `getKeyFromEvent` isn't exported from
	// the native build, so read the key straight off the native event.
	const onKeyPress = React.useCallback(
		(keyPressEvent: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
			const key = keyPressEvent?.nativeEvent?.key;
			if (key) {
				recordKey(key, Date.now());
			}
		},
		[recordKey]
	);

	const reset = React.useCallback(() => {
		if (settleTimerRef.current) {
			clearTimeout(settleTimerRef.current);
			settleTimerRef.current = null;
		}
		currentRef.current = [];
		setCurrentKeys([]);
		setAttempts([]);
	}, []);

	return { currentKeys, attempts, reset, recordKey, onKeyPress };
}
