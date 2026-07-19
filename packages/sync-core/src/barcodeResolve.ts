/**
 * Awaited barcode scan flow (docs/wcpos-pain-points.md §3, CONTEXT.md
 * "Online fallback" / "Targeted record fetch").
 *
 * The latency contract: a local barcode hit is effectively instant; a local
 * miss must produce IMMEDIATE feedback ("searching online") and then resolve
 * within a ~10 second budget. Silence is the bug — the `searching-online`
 * event is emitted synchronously BEFORE any network await, and that ordering
 * is pinned by tests.
 *
 * Server side: GET {syncBase}/resolve/barcode?code=<string> on the
 * versioned `wcpos/v2` namespace
 * (&benchmark_profile=<profile> for non-default profiles). 200 always —
 * not-found is a result, not an error.
 *
 * Pure logic only: all I/O goes through an injectable fetcher and an
 * injectable millisecond clock so tests run with no network and no real
 * timers.
 */

export type BarcodeResolveFetcher = (url: string, init?: RequestInit) => Promise<Response>;

export const barcodeResolveProfiles = [
	'good-local',
	'slow-php',
	'slow-db',
	'large-payload',
] as const;
export type BarcodeResolveProfile = (typeof barcodeResolveProfiles)[number];

// --- Local barcode index --------------------------------------------------------

/** Payload fields that may carry a scannable code, mirroring the server's
 * discovery keys (_sku, _global_unique_id, _barcode). */
export const BARCODE_PAYLOAD_FIELDS = ['sku', 'barcode', 'global_unique_id'] as const;

export type BarcodeIndexEntry = { docId: string };

export type BarcodeIndexResult = {
	index: Map<string, BarcodeIndexEntry>;
	/** One note per cross-document collision (last write wins). */
	diagnostics: string[];
};

/**
 * Builds the in-memory code -> document index the POS consults before going
 * online, indexing each doc by the supplied `fields` (payload field names).
 * Codes are trimmed (matching resolveScan's trim-only normalization); empty and
 * non-string values are skipped. When two different documents claim the same
 * code, the later document wins and a diagnostic records the collision.
 *
 * The field list is a PARAMETER, not a constant: the active barcode mapping
 * comes from the server's representation config (ADR 0006), so a settings-driven
 * field-mapping change is honored by rebuilding with the new list rather than
 * the hardcoded default.
 */
function buildBarcodeIndexFromFields(
	docs: { id: string; payload: Record<string, unknown> }[],
	fields: readonly string[]
): BarcodeIndexResult {
	const index = new Map<string, BarcodeIndexEntry>();
	const diagnostics: string[] = [];
	for (const doc of docs) {
		for (const field of fields) {
			const raw = doc.payload[field];
			if (typeof raw !== 'string') continue;
			const code = raw.trim();
			if (code === '') continue;
			const existing = index.get(code);
			if (existing && existing.docId !== doc.id) {
				diagnostics.push(
					`code "${code}" already mapped to ${existing.docId}; overwritten by ${doc.id} (${field}) — last write wins`
				);
			}
			index.set(code, { docId: doc.id });
		}
	}
	return { index, diagnostics };
}

/**
 * Builds the local barcode index over ALL hardcoded discovery fields
 * (`BARCODE_PAYLOAD_FIELDS`). This is the default cold-build a fresh client uses
 * before it has a representation-config fingerprint to scope the active field;
 * it stays fully backward-compatible (every previously-indexed field still
 * resolves).
 */
export function buildLocalBarcodeIndex(
	docs: { id: string; payload: Record<string, unknown> }[]
): BarcodeIndexResult {
	return buildBarcodeIndexFromFields(docs, BARCODE_PAYLOAD_FIELDS);
}

// --- UPC-A ↔ EAN-13 equivalence (#740) ------------------------------------------

/**
 * The barcode-symbology fields where UPC-A ↔ EAN-13 leading-zero equivalence is
 * valid. `sku` is deliberately excluded: a SKU is an arbitrary stock code, not a
 * scanned barcode symbol, so a numeric SKU must NOT gain a `0`-prefixed twin
 * (that would resolve a scan to an unrelated product).
 */
export const BARCODE_SYMBOLOGY_FIELDS = ['barcode', 'global_unique_id'] as const;

/**
 * Builds a local index over only the barcode-symbology fields
 * (`BARCODE_SYMBOLOGY_FIELDS`) — the subset for which UPC-A/EAN-13 equivalence
 * applies. Same shape as `buildLocalBarcodeIndex`, minus `sku`.
 */
export function buildBarcodeSymbologyIndex(
	docs: { id: string; payload: Record<string, unknown> }[]
): BarcodeIndexResult {
	return buildBarcodeIndexFromFields(docs, BARCODE_SYMBOLOGY_FIELDS);
}

/**
 * A UPC-A symbol is an EAN-13 with an implied leading zero, so the 12-digit
 * UPC-A `012345678905` and the 13-digit `0012345678905` denote the *same*
 * physical barcode. iOS camera decoders report the 13-digit `0`-prefixed form
 * while Android/HID wedges report the bare 12 digits, so a store keyed on one
 * form would otherwise miss scans from the other source.
 *
 * Return the scanned code plus its UPC-A/EAN-13 counterpart (scanned form first)
 * so a lookup can try both — this never rewrites the scanned code, so genuine
 * EAN-13 codes (13 digits not starting with 0) are returned unchanged. The
 * prepended/stripped zero doesn't change the check digit, so no recomputation is
 * needed. Apply the candidates only against a barcode-symbology index (see
 * `buildBarcodeSymbologyIndex`) so a numeric SKU never gains an equivalent form.
 */
export function barcodeMatchCandidates(code: string): string[] {
	const trimmed = code.trim();
	// 13-digit, leading zero → also try the 12-digit UPC-A form.
	if (/^0\d{12}$/.test(trimmed)) {
		return [trimmed, trimmed.slice(1)];
	}
	// 12-digit UPC-A → also try its 13-digit EAN-13 encoding.
	if (/^\d{12}$/.test(trimmed)) {
		return [trimmed, `0${trimmed}`];
	}
	return [trimmed];
}

// --- Config-driven re-derivation (ADR 0006, products specialization) ----------

export type RebuildBarcodeIndexResult = BarcodeIndexResult & {
	/**
	 * True when the index was re-derived locally from already-synced docs — the
	 * needed active field(s) were present in the payloads, so NO server
	 * round-trip was required.
	 */
	rederived: boolean;
	/**
	 * True when local re-derivation was NOT possible because a needed active
	 * field is absent from the synced payloads — the host must mark the
	 * collection stale and re-fetch (the fallback the config signal prescribes).
	 */
	staleCollection: boolean;
	/** The active fields the rebuild actually indexed by (echoed for diagnostics). */
	activeFields: string[];
};

/**
 * Re-derive the local barcode index for the NEW active barcode field mapping
 * WITHOUT a server round-trip when possible. When the products
 * representation-config fingerprint moves (e.g. barcode field `_sku` ->
 * `_global_unique_id`, surfaced by `createConfigChangeSignal` as the resolved
 * `barcodeFields.products`), the already-synced documents very often ALREADY
 * carry the new field in their payload — so the client can simply re-index them
 * by the new field instead of re-fetching the whole catalog.
 *
 * The fallback contract (ADR 0006): if ANY active field is entirely absent from
 * the synced payloads, local re-derivation cannot honor the new mapping — the
 * field was never synced — so the result reports `staleCollection: true` and
 * the host re-fetches. "Present" is judged across the whole doc set (at least
 * one doc carries the field), matching the index's per-doc skip-when-missing
 * behavior; an empty doc set is treated as "nothing to re-derive from", i.e.
 * stale.
 */
export function rebuildBarcodeIndexForConfig(input: {
	docs: { id: string; payload: Record<string, unknown> }[];
	/** The active barcode field list from the config source (payload field names). */
	activeFields: readonly string[];
}): RebuildBarcodeIndexResult {
	const activeFields = [...input.activeFields];

	// A field is "available locally" if at least one synced doc carries a string
	// value for it. A field that NO synced doc carries was never synced — the
	// mapping change cannot be honored offline, so the collection is stale.
	const fieldAvailable = (field: string): boolean =>
		input.docs.some((doc) => typeof doc.payload[field] === 'string');

	const missingField =
		activeFields.length === 0 ||
		input.docs.length === 0 ||
		activeFields.some((field) => !fieldAvailable(field));

	if (missingField) {
		return {
			index: new Map(),
			diagnostics: [],
			rederived: false,
			staleCollection: true,
			activeFields,
		};
	}

	const { index, diagnostics } = buildBarcodeIndexFromFields(input.docs, activeFields);
	return { index, diagnostics, rederived: true, staleCollection: false, activeFields };
}

// --- Resolve endpoint shapes ------------------------------------------------------

export type ResolveBarcodeMatch = {
	id: number;
	type: 'product' | 'variation';
	/** Present for variations (0 for parent products). */
	parent_id?: number;
	payload: Record<string, unknown>;
};

export type ResolveBarcodeAmbiguous = { id: number; type: 'product' | 'variation' };

export type ResolveBarcodeMeta = {
	duration_ms?: number;
	server_profile?: string;
	candidates?: number;
};

export type ResolveBarcodeResponse = {
	code: string;
	found: boolean;
	match: ResolveBarcodeMatch | null;
	ambiguous: ResolveBarcodeAmbiguous[];
	meta?: ResolveBarcodeMeta;
};

// --- resolveScan ----------------------------------------------------------------------

export type ScanEventType =
	| 'local-hit'
	| 'searching-online'
	| 'resolved-online'
	| 'not-found'
	| 'ambiguous'
	| 'error';

/** atMs is milliseconds since scan start, read from the injected clock. */
export type ScanEvent = { type: ScanEventType; atMs: number };

export type ScanTimings = {
	/** Scan start -> first cashier-visible feedback (local-hit or searching-online). */
	scanToFeedbackMs: number;
	/** Scan start -> terminal outcome (hit, resolved, not-found, or error). */
	scanToResolutionMs: number;
};

export type ScanResult =
	| { outcome: 'local'; code: string; docId: string; timings: ScanTimings; events: ScanEvent[] }
	| {
			outcome: 'online';
			code: string;
			match: ResolveBarcodeMatch;
			ambiguous: ResolveBarcodeAmbiguous[];
			serverMeta: ResolveBarcodeMeta | null;
			timings: ScanTimings;
			events: ScanEvent[];
	  }
	| {
			outcome: 'not-found';
			code: string;
			serverMeta: ResolveBarcodeMeta | null;
			timings: ScanTimings;
			events: ScanEvent[];
	  }
	| { outcome: 'error'; code: string; message: string; timings: ScanTimings; events: ScanEvent[] };

export type ResolveScanInput = {
	code: string;
	index: Map<string, BarcodeIndexEntry>;
	syncBaseUrl: string;
	fetcher: BarcodeResolveFetcher;
	/** Millisecond clock (e.g. () => performance.now()). Timings are relative to scan start. */
	now: () => number;
	/** benchmark_profile is only appended when set and not 'good-local'. */
	profile?: BarcodeResolveProfile;
	onEvent: (event: ScanEvent) => void;
};

export function buildResolveBarcodeUrl(input: {
	syncBaseUrl: string;
	code: string;
	profile?: BarcodeResolveProfile;
}): string {
	const params = new URLSearchParams({ code: input.code });
	if (input.profile && input.profile !== 'good-local') {
		params.set('benchmark_profile', input.profile);
	}
	return `${input.syncBaseUrl.replace(/\/$/, '')}/resolve/barcode?${params.toString()}`;
}

/**
 * The awaited scan flow. Local hit -> instant `local-hit`. Local miss ->
 * `searching-online` emitted synchronously BEFORE the fetcher is even
 * invoked (the contract — pinned by tests), then the resolve endpoint
 * answers with resolved-online / not-found / error.
 *
 * Normalization is trim-only here; UPC-A/EAN-13 leading-zero equivalence (#740)
 * is applied by the POS barcode-search layer, which owns local matching (this
 * flow is invoked with an empty local index and drives the online resolve).
 * Check-digit normalization is still future work.
 */
export async function resolveScan(input: ResolveScanInput): Promise<ScanResult> {
	const startMs = input.now();
	const events: ScanEvent[] = [];
	const emit = (type: ScanEventType): ScanEvent => {
		const event: ScanEvent = { type, atMs: input.now() - startMs };
		events.push(event);
		input.onEvent(event);
		return event;
	};

	const code = input.code.trim();
	if (code === '') {
		const terminal = emit('error');
		return {
			outcome: 'error',
			code,
			message: 'empty barcode: nothing to resolve',
			timings: { scanToFeedbackMs: terminal.atMs, scanToResolutionMs: terminal.atMs },
			events,
		};
	}

	const hit = input.index.get(code);
	if (hit) {
		const terminal = emit('local-hit');
		return {
			outcome: 'local',
			code,
			docId: hit.docId,
			timings: { scanToFeedbackMs: terminal.atMs, scanToResolutionMs: terminal.atMs },
			events,
		};
	}

	// Contract: the cashier sees "searching online" before any network await.
	const feedback = emit('searching-online');
	const scanToFeedbackMs = feedback.atMs;
	const url = buildResolveBarcodeUrl({
		syncBaseUrl: input.syncBaseUrl,
		code,
		profile: input.profile,
	});

	let body: ResolveBarcodeResponse;
	try {
		const response = await input.fetcher(url);
		const text = await response.text();
		if (!response.ok) {
			const terminal = emit('error');
			return {
				outcome: 'error',
				code,
				message: `resolve/barcode failed: ${response.status} ${text.slice(0, 200)}`,
				timings: { scanToFeedbackMs, scanToResolutionMs: terminal.atMs },
				events,
			};
		}
		body = JSON.parse(text) as ResolveBarcodeResponse;
	} catch (error) {
		const terminal = emit('error');
		return {
			outcome: 'error',
			code,
			message: `resolve/barcode request failed: ${error instanceof Error ? error.message : String(error)}`,
			timings: { scanToFeedbackMs, scanToResolutionMs: terminal.atMs },
			events,
		};
	}

	const serverMeta = body.meta ?? null;

	if (body.found) {
		if (!body.match) {
			const terminal = emit('error');
			return {
				outcome: 'error',
				code,
				message: 'resolve/barcode returned found=true without a match',
				timings: { scanToFeedbackMs, scanToResolutionMs: terminal.atMs },
				events,
			};
		}
		const terminal = emit('resolved-online');
		const ambiguous = Array.isArray(body.ambiguous) ? body.ambiguous : [];
		if (ambiguous.length > 0) {
			emit('ambiguous');
		}
		return {
			outcome: 'online',
			code,
			match: body.match,
			ambiguous,
			serverMeta,
			timings: { scanToFeedbackMs, scanToResolutionMs: terminal.atMs },
			events,
		};
	}

	const terminal = emit('not-found');
	return {
		outcome: 'not-found',
		code,
		serverMeta,
		timings: { scanToFeedbackMs, scanToResolutionMs: terminal.atMs },
		events,
	};
}

// The bench instrument (runner, scenario prefetch, profile parsing, summary
// stats, markdown rendering) lives in ./bench/barcodeResolveBench — import it
// from the woo-rxdb-replication-lab repo. This module keeps only the engine:
// the local index and the awaited scan flow.
