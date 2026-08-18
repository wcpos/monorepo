import * as React from 'react';

import { useRouter } from 'expo-router';
import { useObservablePickState } from 'observable-hooks';

import { Toast } from '@wcpos/components/toast';

import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { playScanFailure, playScanSuccess } from './play-scan-sound';
import { clampScanSoundVolume, normalizeScanSoundTheme } from './scan-sound-themes';

const SUCCESS_DURATION = 2500;
const ALERT_DURATION = 6000;
// Safety net: a few code paths bail without terminal feedback (e.g. an online
// variation whose parent can't be assembled falls back to search) — the
// searching toast must never be strandable forever, so cap it past the 10s
// lookup deadline instead of using Infinity.
const SEARCHING_DURATION = 30000;

// Monotonic per-session counter so every scan owns one toast id and later
// lifecycle stages update that toast in place instead of stacking new ones.
let scanSeq = 0;
function nextScanId(): string {
	scanSeq += 1;
	return `scan:${scanSeq}`;
}

export interface ScanFeedbackHandle {
	searchingOnline: (code: string) => void;
	added: (name: string) => void;
	addFailed: (name: string) => void;
	notFound: (code: string) => void;
	ambiguous: (count: number, code: string) => void;
	error: (code: string) => void;
	outOfStock: (name: string, code: string) => void;
	unavailable: (code: string) => void;
	/** The local database lost its storage worker — nothing can be looked up (#163). */
	storageUnavailable: (code: string) => void;
}

export const useScanFeedback = () => {
	const t = useT();
	const { store } = useAppState();
	const router = useRouter();
	// Scan sounds are opt-in per station (#717). Success plays the theme's
	// success tone; every non-success terminal outcome plays its failure tone
	// (plus a native error haptic unless disabled). Searching-online stays silent.
	const sound = useObservablePickState(
		store.$,
		() => {
			const latest = store.getLatest();
			return {
				barcode_scanning_sound_enabled: latest.barcode_scanning_sound_enabled ?? false,
				barcode_scanning_sound_theme: latest.barcode_scanning_sound_theme,
				barcode_scanning_sound_volume: latest.barcode_scanning_sound_volume,
				barcode_scanning_sound_success_enabled:
					latest.barcode_scanning_sound_success_enabled ?? true,
				barcode_scanning_sound_failure_enabled:
					latest.barcode_scanning_sound_failure_enabled ?? true,
				barcode_scanning_sound_haptic_enabled: latest.barcode_scanning_sound_haptic_enabled ?? true,
			};
		},
		'barcode_scanning_sound_enabled',
		'barcode_scanning_sound_theme',
		'barcode_scanning_sound_volume',
		'barcode_scanning_sound_success_enabled',
		'barcode_scanning_sound_failure_enabled',
		'barcode_scanning_sound_haptic_enabled'
	);
	// A handle outlives begin() (an online lookup can terminate seconds later), so
	// read the settings at play-time via a ref — toggling them off silences even
	// an in-flight scan instead of playing the values captured when begin() ran.
	const soundRef = React.useRef(sound);
	React.useEffect(() => {
		soundRef.current = sound;
	}, [sound]);

	const begin = React.useCallback((): ScanFeedbackHandle => {
		const id = nextScanId();

		const success = () => {
			const current = soundRef.current;
			if (
				current.barcode_scanning_sound_enabled &&
				current.barcode_scanning_sound_success_enabled
			) {
				playScanSuccess({
					theme: normalizeScanSoundTheme(current.barcode_scanning_sound_theme),
					volume: clampScanSoundVolume(current.barcode_scanning_sound_volume),
				});
			}
		};
		const failure = () => {
			const current = soundRef.current;
			if (
				current.barcode_scanning_sound_enabled &&
				current.barcode_scanning_sound_failure_enabled
			) {
				playScanFailure({
					theme: normalizeScanSoundTheme(current.barcode_scanning_sound_theme),
					volume: clampScanSoundVolume(current.barcode_scanning_sound_volume),
					haptic: current.barcode_scanning_sound_haptic_enabled,
				});
			}
		};

		return {
			searchingOnline: (code) => {
				Toast.show({
					id,
					title: t('common.barcode_searching_online'),
					description: code,
					duration: SEARCHING_DURATION,
				});
			},
			added: (name) => {
				success();
				Toast.show({
					id,
					type: 'success',
					title: t('pos_products.scan_added'),
					description: name,
					duration: SUCCESS_DURATION,
				});
			},
			addFailed: (name) => {
				failure();
				Toast.show({
					id,
					type: 'error',
					title: t('pos_products.scan_add_failed'),
					description: name,
					duration: ALERT_DURATION,
				});
			},
			notFound: (code) => {
				failure();
				Toast.show({
					id,
					type: 'warning',
					title: t('pos_products.scan_not_found'),
					description: t('pos_products.scan_not_found_description', {
						code,
					}),
					duration: ALERT_DURATION,
				});
			},
			ambiguous: (count, code) => {
				failure();
				Toast.show({
					id,
					type: 'warning',
					title: t('pos_products.scan_several_matches'),
					description: `${t('common.product_found_locally', { count })} — ${code}`,
					duration: ALERT_DURATION,
				});
			},
			error: (code) => {
				failure();
				Toast.show({
					id,
					type: 'error',
					title: t('pos_products.scan_lookup_failed'),
					description: t('pos_products.scan_lookup_failed_description', {
						code,
					}),
					duration: ALERT_DURATION,
				});
			},
			outOfStock: (name, code) => {
				failure();
				Toast.show({
					id,
					type: 'warning',
					title: t('pos_products.out_of_stock', { name }),
					description: code,
					duration: ALERT_DURATION,
				});
			},
			unavailable: (code) => {
				failure();
				// With no standing outage banner (the cashier only hears about an
				// offline engine when a scan actually needs it), the toast carries the
				// link to the health screen the banner used to provide.
				Toast.show({
					id,
					type: 'error',
					title: t('pos_products.scan_unavailable'),
					description: t('pos_products.scan_unavailable_description', {
						code,
					}),
					duration: ALERT_DURATION,
					action: {
						label: t('pos_products.scan_outage_view_status'),
						onClick: () => router.push('/health/database'),
					},
				});
			},
			// Same surface as `unavailable` (#725) with the honest cause: the sync
			// engine is beside the point when the local database itself is gone.
			storageUnavailable: (code) => {
				failure();
				Toast.show({
					id,
					type: 'error',
					title: t('pos_products.scan_unavailable'),
					description: t('pos_products.scan_storage_unavailable_description', {
						code,
					}),
					duration: ALERT_DURATION,
				});
			},
		};
	}, [t, router]);

	return { begin };
};
