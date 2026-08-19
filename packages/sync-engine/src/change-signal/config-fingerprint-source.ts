/**
 * Package-private live ConfigFingerprintSource (facade slice 3) — the config-
 * change tier (ADR 0006: settings-change staleness; a barcode-field flip with
 * no product row change must still re-derive). Ported from the lab web host's
 * live adapter; one endpoint request, one snake_case→camelCase projection.
 */
import type {
	BarcodeConfigCollection,
	BarcodeMaterializedCollection,
	ConfigFingerprintSnapshot,
	ConfigFingerprintSource,
} from '@wcpos/sync-core';

import { BARCODE_MATERIALIZED_COLLECTIONS } from '../materialization/barcode-selectors';

/** Fetcher contract — same shape the rest of the bench uses. */
export type ConfigSourceFetcher = (
	url: string,
	init?: { headers?: HeadersInit; signal?: AbortSignal }
) => Promise<Response>;

/**
 * Where the resolved barcode carriers land. The carriers belong to ONE store
 * scope (ADR 0006 — two sites may map barcodes to different fields), so the
 * source never owns them: the caller supplies the sink bound to the scope it is
 * polling for.
 */
export type BarcodeSelectorSink = (
	collection: BarcodeMaterializedCollection,
	selectors: readonly string[]
) => void;

export type CreateConfigFingerprintLiveSourceInput = {
	/** e.g. http://wcpos.local/wp-json/wcpos/v2 (no trailing slash). */
	syncBaseUrl: string;
	/** Already-authenticated fetcher (Basic-auth header injected upstream). */
	fetcher: ConfigSourceFetcher;
	/** Scope-bound sink for the carriers each poll resolves. */
	publishBarcodeSelectors?: BarcodeSelectorSink;
};

/** The raw envelope the PHP endpoint emits. */
export type ConfigFingerprintEnvelope = {
	candidate?: string;
	fingerprints: Record<string, string>;
	barcode_fields?: Record<string, string[]>;
	meta?: { duration_ms?: number; supported?: boolean };
};

const BARCODE_CONFIG_COLLECTIONS: readonly BarcodeConfigCollection[] = [
	'products',
	'variations',
	'tax_rates',
];

function isBarcodeConfigCollection(value: string): value is BarcodeConfigCollection {
	return (BARCODE_CONFIG_COLLECTIONS as readonly string[]).includes(value);
}

/**
 * PURE projection of the endpoint envelope to the engine's snapshot shape. Kept
 * separate from fetch so the unit test exercises the exact mapping with no
 * network. Unknown collection keys are dropped (the engine speaks only
 * BarcodeConfigCollection for config fingerprints); `barcode_fields` is renamed to `barcodeFields` and omitted
 * when the endpoint did not report it.
 */
export function mapConfigFingerprintEnvelope(
	envelope: ConfigFingerprintEnvelope
): ConfigFingerprintSnapshot {
	const fingerprints = {} as Record<BarcodeConfigCollection, string>;
	for (const [collection, fingerprint] of Object.entries(envelope.fingerprints ?? {})) {
		if (isBarcodeConfigCollection(collection) && typeof fingerprint === 'string') {
			fingerprints[collection] = fingerprint;
		}
	}

	const snapshot: ConfigFingerprintSnapshot = { fingerprints };

	if (envelope.barcode_fields) {
		const barcodeFields = {} as Record<BarcodeConfigCollection, string[]>;
		for (const [collection, fields] of Object.entries(envelope.barcode_fields)) {
			if (isBarcodeConfigCollection(collection) && Array.isArray(fields)) {
				barcodeFields[collection] = fields.filter(
					(field): field is string => typeof field === 'string'
				);
			}
		}
		snapshot.barcodeFields = barcodeFields;
	}

	return snapshot;
}

export function applyBarcodeSelectorsFromSnapshot(
	snapshot: ConfigFingerprintSnapshot,
	publish: BarcodeSelectorSink | undefined
): void {
	if (!publish) return;
	for (const collection of BARCODE_MATERIALIZED_COLLECTIONS) {
		const selectors = snapshot.barcodeFields?.[collection];
		// Empty lists are deliberately not applied so old-plugin envelopes preserve stale-but-plausible selectors.
		if (selectors && selectors.length > 0) {
			publish(collection, selectors);
		}
	}
}

/**
 * Builds the live ConfigFingerprintSource the config-change signal consumes.
 * Request, project, and publish active selectors; no retries.
 */
export function createConfigFingerprintLiveSource(
	input: CreateConfigFingerprintLiveSourceInput
): ConfigFingerprintSource {
	let etag: string | null = null;
	let cachedSnapshot: ConfigFingerprintSnapshot | null = null;

	return {
		async pollConfigFingerprints() {
			const url = `${input.syncBaseUrl}/changes/config-fingerprint`;
			const validator = etag;
			const response = await input.fetcher(
				url,
				validator === null ? undefined : { headers: { 'If-None-Match': validator } }
			);
			if (response.status === 304 && validator !== null && cachedSnapshot !== null) {
				applyBarcodeSelectorsFromSnapshot(cachedSnapshot, input.publishBarcodeSelectors);
				return cachedSnapshot;
			}
			if (!response.ok) {
				throw new Error(`changes/config-fingerprint failed: ${response.status}`);
			}
			const body = await response.text();
			cachedSnapshot = mapConfigFingerprintEnvelope(JSON.parse(body) as ConfigFingerprintEnvelope);
			etag = response.headers.get('etag');
			applyBarcodeSelectorsFromSnapshot(cachedSnapshot, input.publishBarcodeSelectors);
			return cachedSnapshot;
		},
	};
}

/**
 * The scope-open read (facade `switchScope`): resolve this scope's barcode
 * carriers BEFORE anything materializes documents into it, and publish them
 * onto that scope. Rejects on transport failure — the caller records the miss
 * on the scope so the recovery re-pull can run once carriers do arrive.
 */
export async function hydrateBarcodeSelectors(
	input: CreateConfigFingerprintLiveSourceInput & {
		publishBarcodeSelectors: BarcodeSelectorSink;
		signal: AbortSignal;
	}
): Promise<void> {
	const source = createConfigFingerprintLiveSource({
		syncBaseUrl: input.syncBaseUrl,
		fetcher: (url, init) => input.fetcher(url, { ...init, signal: input.signal }),
		publishBarcodeSelectors: input.publishBarcodeSelectors,
	});
	await source.pollConfigFingerprints();
}
