import * as React from 'react';

import { v4 as uuidv4 } from 'uuid';

import { wedgeKeyEventsModule, type WedgeKeyPayload } from './use-attributed-wedge';
import { useCollection } from '../use-collection';

export interface ScannerCandidate {
	deviceName: string;
	vendorId: number;
	productId: number;
}

/**
 * Registration flow for an attributed scanner: capture-all mode listens to
 * every external key event (without swallowing) until a non-virtual device
 * speaks, which becomes the registration candidate.
 */
export const useScannerRegistration = () => {
	const { collection } = useCollection('scanner_profiles');
	const [capturing, setCapturing] = React.useState(false);
	const [candidate, setCandidate] = React.useState<ScannerCandidate | null>(null);
	const subscriptionRef = React.useRef<{ remove: () => void } | null>(null);

	const stop = React.useCallback(() => {
		subscriptionRef.current?.remove();
		subscriptionRef.current = null;
		wedgeKeyEventsModule?.setCaptureAll(false);
		setCapturing(false);
	}, []);

	const start = React.useCallback(() => {
		if (!wedgeKeyEventsModule) {
			return;
		}
		setCandidate(null);
		setCapturing(true);
		wedgeKeyEventsModule.setCaptureAll(true);
		subscriptionRef.current = wedgeKeyEventsModule.addListener(
			'onWedgeKey',
			(payload: WedgeKeyPayload) => {
				// The built-in/virtual keyboard reports 0:0 — wait for a real device.
				if (payload.vendorId === 0 && payload.productId === 0) {
					return;
				}
				setCandidate({
					deviceName: payload.deviceName,
					vendorId: payload.vendorId,
					productId: payload.productId,
				});
				subscriptionRef.current?.remove();
				subscriptionRef.current = null;
				wedgeKeyEventsModule?.setCaptureAll(false);
				setCapturing(false);
			}
		);
	}, []);

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
