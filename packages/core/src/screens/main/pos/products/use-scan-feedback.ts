import * as React from 'react';

import { Toast } from '@wcpos/components/toast';

import { useT } from '../../../../contexts/translations';

const SUCCESS_DURATION = 2500;
const ALERT_DURATION = 6000;
// Outlives the 10s online-lookup deadline; always superseded by the terminal update.
const SEARCHING_DURATION = 15000;

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
	notFound: (code: string) => void;
	ambiguous: (count: number, code: string) => void;
	error: (code: string) => void;
	outOfStock: (name: string) => void;
	unavailable: (code: string) => void;
}

export const useScanFeedback = () => {
	const t = useT();

	const begin = React.useCallback((): ScanFeedbackHandle => {
		const id = nextScanId();

		return {
			searchingOnline: (code) => {
				Toast.show({
					id,
					title: t('common.barcode_searching_online', { defaultValue: 'Searching store…' }),
					description: code,
					duration: SEARCHING_DURATION,
				});
			},
			added: (name) => {
				Toast.show({
					id,
					type: 'success',
					title: t('pos_products.scan_added', { defaultValue: 'Added to cart' }),
					description: name,
					duration: SUCCESS_DURATION,
				});
			},
			notFound: (code) => {
				Toast.show({
					id,
					type: 'warning',
					title: t('pos_products.scan_not_found', { defaultValue: 'Barcode not found' }),
					description: t('pos_products.scan_not_found_description', {
						code,
						defaultValue: '{code} — not in this store, locally or online',
					}),
					duration: ALERT_DURATION,
				});
			},
			ambiguous: (count, code) => {
				Toast.show({
					id,
					type: 'warning',
					title: t('pos_products.scan_several_matches', { defaultValue: 'Several matches' }),
					description: `${t('common.product_found_locally', { count })} — ${code}`,
					duration: ALERT_DURATION,
				});
			},
			error: (code) => {
				Toast.show({
					id,
					type: 'error',
					title: t('pos_products.scan_lookup_failed', { defaultValue: 'Lookup failed' }),
					description: t('pos_products.scan_lookup_failed_description', {
						code,
						defaultValue: '{code} — Store didn’t respond — check your connection and scan again',
					}),
					duration: ALERT_DURATION,
				});
			},
			outOfStock: (name) => {
				Toast.show({
					id,
					type: 'warning',
					title: t('pos_products.out_of_stock', { name }),
					duration: ALERT_DURATION,
				});
			},
			unavailable: (code) => {
				Toast.show({
					id,
					type: 'error',
					title: t('pos_products.scan_unavailable', { defaultValue: 'Scanning unavailable' }),
					description: t('pos_products.scan_unavailable_description', {
						code,
						defaultValue: '{code} — Sync engine is offline — see the banner above the products',
					}),
					duration: ALERT_DURATION,
				});
			},
		};
	}, [t]);

	return { begin };
};
