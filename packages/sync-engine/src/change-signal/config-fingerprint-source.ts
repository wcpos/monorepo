/**
 * Package-private live ConfigFingerprintSource (facade slice 3) — the config-
 * change tier (ADR 0006: settings-change staleness; a barcode-field flip with
 * no product row change must still re-derive). Ported from the web host's
 * adapter (apps/web/src/bench/configFingerprintLiveSource.ts, kept until
 * #430); one endpoint request, one snake_case→camelCase projection.
 */
import type {
	BarcodeConfigCollection,
	ConfigFingerprintSnapshot,
	ConfigFingerprintSource,
} from '@wcpos/sync-core';

/** Fetcher contract — same shape the rest of the bench uses. */
export type ConfigSourceFetcher = (
	url: string,
	init?: { signal?: AbortSignal }
) => Promise<Response>;

export type CreateConfigFingerprintLiveSourceInput = {
	/** e.g. http://wcpos.local/wp-json/wcpos/v2 (no trailing slash). */
	syncBaseUrl: string;
	/** Already-authenticated fetcher (Basic-auth header injected upstream). */
	fetcher: ConfigSourceFetcher;
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

/**
 * Builds the live ConfigFingerprintSource the config-change signal consumes.
 * Pure mapping: no engine logic, no policy, no retries — request + project.
 */
export function createConfigFingerprintLiveSource(
	input: CreateConfigFingerprintLiveSourceInput
): ConfigFingerprintSource {
	return {
		async pollConfigFingerprints() {
			const url = `${input.syncBaseUrl}/changes/config-fingerprint`;
			const response = await input.fetcher(url);
			const body = await response.text();
			if (!response.ok) {
				throw new Error(`changes/config-fingerprint failed: ${response.status}`);
			}
			return mapConfigFingerprintEnvelope(JSON.parse(body) as ConfigFingerprintEnvelope);
		},
	};
}
