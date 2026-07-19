import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { v4 as uuidv4 } from 'uuid';

import { createWedgeState, foldWedgeKey, type WedgeState } from '@wcpos/scanner';

import { wedgeKeyEventsModule, type WedgeKeyPayload } from './use-attributed-wedge';
import { useAppState } from '../../../../contexts/app-state';
import { useCollection } from '../use-collection';

export interface ScannerCandidate {
	deviceName: string;
	vendorId: number;
	productId: number;
}

/**
 * Registration flow for an attributed scanner: capture-all mode listens to
 * every external key event (without swallowing) and promotes a device to the
 * registration candidate only once it produces a scanner-like burst — a
 * contiguous run of fast keystrokes that latches the wedge heuristic and reaches
 * the minimum length. A gap at/above the detection threshold ends the burst.
 *
 * A single keypress from an ordinary USB/BT keyboard must never register that
 * keyboard as a scanner (#739): the interceptor would then swallow its keys and
 * assemble ordinary typing into scans. Each device gets its own wedge state so
 * one fast device isn't masked by slow typing on another. Detection reuses the
 * shared `foldWedgeKey` reducer but is deliberately stricter than the live scan
 * path — registration persistently swallows a device's input, so it demands a
 * contiguous fast burst rather than latching on a single fast keypair.
 */
export const useScannerRegistration = () => {
	const { store } = useAppState();
	const { collection } = useCollection('scanner_profiles');
	const [capturing, setCapturing] = React.useState(false);
	const [candidate, setCandidate] = React.useState<ScannerCandidate | null>(null);
	const subscriptionRef = React.useRef<{ remove: () => void } | null>(null);
	// One folded-average detector per device seen during this capture session.
	const detectorsRef = React.useRef<Map<string, WedgeState>>(new Map());

	const threshold = useObservableEagerState(
		store.barcode_scanning_avg_time_input_threshold$
	) as number;
	const minChars = useObservableEagerState(store.barcode_scanning_min_chars$) as number;
	// Event-time reads of the latest settings (refs must not be written in render).
	const settingsRef = React.useRef({ threshold: Number(threshold), minChars: Number(minChars) });
	React.useEffect(() => {
		settingsRef.current = { threshold: Number(threshold), minChars: Number(minChars) };
	}, [threshold, minChars]);

	const stop = React.useCallback(() => {
		subscriptionRef.current?.remove();
		subscriptionRef.current = null;
		wedgeKeyEventsModule?.setCaptureAll(false);
		detectorsRef.current.clear();
		setCapturing(false);
	}, []);

	const start = React.useCallback(() => {
		if (!wedgeKeyEventsModule) {
			return;
		}
		setCandidate(null);
		setCapturing(true);
		detectorsRef.current = new Map();
		wedgeKeyEventsModule.setCaptureAll(true);
		subscriptionRef.current = wedgeKeyEventsModule.addListener(
			'onWedgeKey',
			(payload: WedgeKeyPayload) => {
				// The built-in/virtual keyboard reports 0:0 — wait for a real device.
				if (payload.vendorId === 0 && payload.productId === 0) {
					return;
				}
				const deviceKey = `${payload.deviceId}:${payload.vendorId}:${payload.productId}:${payload.deviceName}`;
				let state = detectorsRef.current.get(deviceKey);
				if (!state) {
					state = createWedgeState();
					detectorsRef.current.set(deviceKey, state);
				}
				const { threshold: currentThreshold, minChars: currentMinChars } = settingsRef.current;
				// End-of-burst reset (#739): only a *contiguous* run of scanner-fast
				// keystrokes may accumulate. Any inter-key gap at/above the detection
				// threshold ends the burst, so a fast keypair followed by ordinary typing
				// can never keep `detecting` latched and creep up to minChars. Without
				// this, `foldWedgeKey` keeps appending slow keys once latched.
				if (state.lastTimeMs !== null && payload.timeMs - state.lastTimeMs >= currentThreshold) {
					state = createWedgeState();
					detectorsRef.current.set(deviceKey, state);
				}
				foldWedgeKey(state, payload.key, payload.timeMs, currentThreshold);
				// Latch only on a scanner-fast burst that reaches the min length; slow
				// typing never sets `detecting`, and a lone key never reaches the stack.
				if (state.detecting && state.stack.length >= Math.max(currentMinChars, 1)) {
					setCandidate({
						deviceName: payload.deviceName,
						vendorId: payload.vendorId,
						productId: payload.productId,
					});
					stop();
				}
			}
		);
	}, [stop]);

	const save = React.useCallback(
		async (label: string) => {
			if (!candidate) {
				return;
			}
			await collection.insert({
				id: uuidv4(),
				label: label || candidate.deviceName,
				connectionType: 'wedge-attributed',
				deviceName: candidate.deviceName,
				vendorId: candidate.vendorId,
				productId: candidate.productId,
				createdAt: new Date().toISOString(),
			});
			setCandidate(null);
		},
		[collection, candidate]
	);

	// Teardown on unmount: never leave the interceptor in capture-all mode.
	React.useEffect(() => stop, [stop]);

	return {
		available: wedgeKeyEventsModule !== null,
		capturing,
		candidate,
		start,
		stop,
		save,
		discard: () => setCandidate(null),
	};
};
