import * as React from 'react';
import { Platform } from 'react-native';

import { requireOptionalNativeModule } from 'expo-modules-core';
import {
	useObservableCallback,
	useObservableEagerState,
	useObservableState,
} from 'observable-hooks';

import type { ScannerProfileDocument } from '@wcpos/database';
import { type BurstAssembler, createBurstAssembler, type ScanEvent } from '@wcpos/scanner';

import { showTooShortFeedback } from './too-short-feedback';
import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useCollection } from '../use-collection';

export interface WedgeKeyPayload {
	key: string;
	deviceId: number;
	deviceName: string;
	vendorId: number;
	productId: number;
	timeMs: number;
	captured: boolean;
}

export interface WedgeKeyEventsNativeModule {
	setCapturedDevices: (
		identities: { vendorId: number; productId: number; deviceName: string }[]
	) => void;
	setCaptureAll: (enabled: boolean) => void;
	addListener: (
		event: 'onWedgeKey',
		listener: (payload: WedgeKeyPayload) => void
	) => { remove: () => void };
}

/**
 * The native Activity-level key interceptor (Android only; null everywhere
 * else and on builds without the local module).
 */
export const wedgeKeyEventsModule: WedgeKeyEventsNativeModule | null =
	Platform.OS === 'android'
		? requireOptionalNativeModule<WedgeKeyEventsNativeModule>('WedgeKeyEvents')
		: null;

const NO_PROFILES: ScannerProfileDocument[] = [];

/**
 * The attributed-wedge input source (architecture: wcpos/monorepo#715): keys
 * from a registered scanner are swallowed at the Activity level and assembled
 * into bursts with no timing heuristic — device identity replaces guessing.
 */
export const useAttributedWedge = () => {
	const t = useT();
	const { store } = useAppState();
	const { collection } = useCollection('scanner_profiles');
	const profiles = useObservableState(
		React.useMemo(() => collection.find().$, [collection]),
		NO_PROFILES
	) as ScannerProfileDocument[];

	const prefix = useObservableEagerState(store.barcode_scanning_prefix$) as string;
	const suffix = useObservableEagerState(store.barcode_scanning_suffix$) as string;
	const minChars = useObservableEagerState(store.barcode_scanning_min_chars$) as number;

	// Latest reactive values behind refs for event-time reads (refs must not be
	// written during render; sync effects keep them fresh).
	const settingsRef = React.useRef({ prefix, suffix, minChars: Number(minChars) });
	const tRef = React.useRef(t);
	React.useEffect(() => {
		settingsRef.current = { prefix, suffix, minChars: Number(minChars) };
	}, [prefix, suffix, minChars]);
	React.useEffect(() => {
		tRef.current = t;
	}, [t]);

	const [emitScan, scanEvents$] = useObservableCallback<ScanEvent>((event$) => event$);

	// External-subscription lifecycle: register device identities with the
	// native interceptor and assemble its key events into scans.
	React.useEffect(() => {
		if (!wedgeKeyEventsModule || profiles.length === 0) {
			return;
		}
		const assemblers = new Map<string, BurstAssembler>();
		wedgeKeyEventsModule.setCapturedDevices(
			profiles.map((profile) => ({
				vendorId: profile.vendorId ?? 0,
				productId: profile.productId ?? 0,
				deviceName: profile.deviceName,
			}))
		);
		const subscription = wedgeKeyEventsModule.addListener('onWedgeKey', (payload) => {
			if (!payload.captured) {
				return;
			}
			const profile = profiles.find(
				(candidate) =>
					candidate.vendorId === payload.vendorId &&
					candidate.productId === payload.productId &&
					(!candidate.deviceName || candidate.deviceName === payload.deviceName)
			);
			if (!profile) {
				return;
			}
			const deviceKey = `${payload.vendorId}:${payload.productId}:${payload.deviceName}`;
			let assembler = assemblers.get(deviceKey);
			if (!assembler) {
				assembler = createBurstAssembler({
					getSettings: () => settingsRef.current,
					onScan: (code) => {
						const { minChars: currentMinChars } = settingsRef.current;
						if (code.length < currentMinChars) {
							showTooShortFeedback(tRef.current, code, currentMinChars);
							return;
						}
						emitScan({
							code,
							source: {
								kind: 'wedge-attributed',
								profileId: profile.id,
								deviceName: payload.deviceName,
							},
							timestamp: Date.now(),
						});
					},
				});
				assemblers.set(deviceKey, assembler);
			}
			assembler.push(payload.key);
		});

		return () => {
			subscription.remove();
			wedgeKeyEventsModule.setCapturedDevices([]);
			for (const assembler of assemblers.values()) {
				assembler.dispose();
			}
		};
	}, [profiles, emitScan]);

	return {
		scanEvents$,
		available: wedgeKeyEventsModule !== null,
		profiles,
	};
};
