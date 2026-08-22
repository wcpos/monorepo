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

export type BarcodeMaterializedCollection = 'products' | 'variations';

/**
 * The ACTIVE barcode carriers are per-STORE-SCOPE state, not module state: which
 * payload field carries a scannable code comes from that site's representation
 * config (ADR 0006), so two scopes can legitimately disagree. They are owned by
 * the sync engine's scope (`ActiveScope.barcodeSelectors`) and travel to every
 * consumer as an explicit `selectors` argument — this module stays pure.
 */
export function deriveBarcodeFromPayload(
	rawPayload: Record<string, unknown>,
	selectors: readonly string[]
): string | undefined {
	for (const selector of selectors) {
		const metadata = Array.isArray(rawPayload.meta_data)
			? (rawPayload.meta_data as { key?: unknown; value?: unknown }[])
			: [];
		const value = selector.startsWith('meta_data:')
			? metadata.find(({ key }) => key === selector.slice('meta_data:'.length))?.value
			: rawPayload[selector];
		if (typeof value !== 'string') continue;
		const barcode = value.trim();
		if (barcode !== '') return barcode;
	}
	return undefined;
}

export function mapBarcodeEditToPayload(
	payload: Record<string, unknown>,
	selectors: readonly string[]
): Record<string, unknown> {
	const mapped = { ...payload };
	const barcode = typeof mapped.barcode === 'string' ? mapped.barcode.trim() : undefined;
	delete mapped.barcode;
	const selector = selectors[0];
	if (barcode === undefined || selector === undefined) return mapped;
	if (!selector.startsWith('meta_data:')) {
		mapped[selector] = barcode;
		return mapped;
	}
	const key = selector.slice('meta_data:'.length);
	const metadata = Array.isArray(mapped.meta_data) ? [...mapped.meta_data] : [];
	const index = metadata.findIndex((entry) => entry.key === key);
	const carrier = { key, value: barcode };
	if (index === -1) metadata.push(carrier);
	else metadata[index] = { ...metadata[index], ...carrier };
	mapped.meta_data = metadata;
	return mapped;
}

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
 * The same GTIN can also print as an 8-digit UPC-E on a small package, so a
 * 12-digit scan additionally offers the UPC-E it compresses to — a store that
 * keyed what was printed still resolves. The reverse is deliberately absent; see
 * the note in the body.
 *
 * Return the scanned code plus every equivalent form (scanned form first) so a
 * lookup can try them all — this never rewrites the scanned code, so genuine
 * EAN-13 codes (13 digits not starting with 0) are returned unchanged. The
 * prepended/stripped zero doesn't change the check digit, so no recomputation is
 * needed. Apply the candidates only against a barcode-symbology index (see
 * `buildBarcodeSymbologyIndex`) so a numeric SKU never gains an equivalent form.
 */
export function barcodeMatchCandidates(code: string): string[] {
	const trimmed = code.trim();
	const candidates = [trimmed];
	const add = (value: string | null): void => {
		if (value !== null && !candidates.includes(value)) {
			candidates.push(value);
		}
	};

	// The 12-digit UPC-A this scan denotes, if any — the hub every other retail
	// form converts through.
	let upcA: string | null = null;
	if (/^0\d{12}$/.test(trimmed)) {
		// 13-digit, leading zero → also try the 12-digit UPC-A form.
		upcA = trimmed.slice(1);
		add(upcA);
	} else if (/^\d{12}$/.test(trimmed)) {
		// 12-digit UPC-A → also try its 13-digit EAN-13 encoding.
		upcA = trimmed;
		add(`0${trimmed}`);
	}
	// Deliberately NOT the reverse: an 8-digit scan is never expanded to the UPC-A
	// it might be the UPC-E of. Eight digits beginning 0 or 1 can be either
	// symbology, and a check digit cannot tell them apart — for the x6∈5..9 family
	// (half the UPC-E space, and its commonest form) a valid UPC-E is ALWAYS also
	// a valid EAN-8, because the four zeros the expansion inserts shift the other
	// digits by an even number of places and so leave the weighted sum unchanged.
	// Expanding on a guess would let an EAN-8 that isn't in the catalog resolve to
	// an unrelated product: a silently wrong line on the receipt, which is far
	// worse than a not-found the cashier can see and act on. The 12→8 direction
	// below is safe because a 12-digit code is unambiguous.

	// …and the UPC-E the same GTIN prints as, when it has one. Deduped, so a scan
	// that already IS the UPC-E form doesn't repeat itself.
	if (upcA !== null) {
		add(compressToUpcE(upcA));
	}

	return candidates;
}

// --- UPC-E ↔ UPC-A equivalence ---------------------------------------------------

/**
 * UPC-E is a UPC-A with a run of zeros squeezed out so the symbol fits on a
 * small package: `01234565` and `012345000065` are the same GTIN. Which one a
 * store holds depends on where the merchant got it — reading the package gives
 * the 8 printed digits, supplier data gives the 12 — and decoders disagree the
 * same way (zxing-wasm expands to the 12-digit form; some native readers report
 * the 8). Offering both means the item reaches the cart either way.
 */

/** The mod-10 check digit for a GTIN body (mirrors `hasValidRetailCheckDigit`). */
function gtinCheckDigit(body: string): string {
	let sum = 0;
	for (let i = body.length - 1, weight = 3; i >= 0; i -= 1, weight = weight === 3 ? 1 : 3) {
		sum += Number(body[i]) * weight;
	}
	return String((10 - (sum % 10)) % 10);
}

/**
 * Expands an 8-digit UPC-E to its 12-digit UPC-A. Returns null when the input
 * isn't a valid UPC-E — including an EAN-8 that happens to start with 0 or 1,
 * which the check-digit test rejects (a UPC-E's last digit is the check digit of
 * the EXPANDED code, so a genuine UPC-E always agrees with its expansion).
 */
export function expandUpcE(code: string): string | null {
	if (!/^[01]\d{7}$/.test(code)) {
		return null;
	}
	const numberSystem = code[0];
	const [x1, x2, x3, x4, x5, x6] = code.slice(1, 7);
	const check = code[7];
	// The last data digit says which zero run was squeezed out.
	let body: string;
	switch (x6) {
		case '0':
		case '1':
		case '2':
			body = `${x1}${x2}${x6}0000${x3}${x4}${x5}`;
			break;
		case '3':
			body = `${x1}${x2}${x3}00000${x4}${x5}`;
			break;
		case '4':
			body = `${x1}${x2}${x3}${x4}00000${x5}`;
			break;
		default:
			body = `${x1}${x2}${x3}${x4}${x5}0000${x6}`;
	}
	const upcA = `${numberSystem}${body}${check}`;
	return gtinCheckDigit(upcA.slice(0, 11)) === check ? upcA : null;
}

/**
 * Compresses a 12-digit UPC-A to its UPC-E, or null when the code has no UPC-E
 * form (most don't — only number system 0/1 with the right zero run qualifies).
 * The candidate is confirmed by expanding it back, so a subtle mistake in the
 * pattern rules yields no candidate rather than a wrong one.
 */
export function compressToUpcE(upcA: string): string | null {
	if (!/^[01]\d{11}$/.test(upcA)) {
		return null;
	}
	const d = upcA;
	let middle: string | null = null;
	if (d[4] === '0' && d[5] === '0' && d[6] === '0' && d[7] === '0' && '012'.includes(d[3])) {
		middle = `${d[1]}${d[2]}${d[8]}${d[9]}${d[10]}${d[3]}`;
	} else if (d[4] === '0' && d[5] === '0' && d[6] === '0' && d[7] === '0' && d[8] === '0') {
		middle = `${d[1]}${d[2]}${d[3]}${d[9]}${d[10]}3`;
	} else if (d[5] === '0' && d[6] === '0' && d[7] === '0' && d[8] === '0' && d[9] === '0') {
		middle = `${d[1]}${d[2]}${d[3]}${d[4]}${d[10]}4`;
	} else if (
		d[6] === '0' &&
		d[7] === '0' &&
		d[8] === '0' &&
		d[9] === '0' &&
		'56789'.includes(d[10])
	) {
		middle = `${d[1]}${d[2]}${d[3]}${d[4]}${d[5]}${d[10]}`;
	}
	if (middle === null) {
		return null;
	}
	const candidate = `${d[0]}${middle}${d[11]}`;
	return expandUpcE(candidate) === upcA ? candidate : null;
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
	'local-hit' | 'searching-online' | 'resolved-online' | 'not-found' | 'ambiguous' | 'error';

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
 * UPC-A/EAN-13 leading-zero equivalence (#740) applies to BOTH lookups here:
 * the local index is probed with every `barcodeMatchCandidates` form, and a
 * server `found:false` for the scanned form is retried with the counterpart
 * before the scan is called a miss. Without the online half, a UPC-A scanned by
 * a decoder that reports the 13-digit GTIN form (zxing-wasm 3.x normalizes
 * every UPC symbol that way, as does the iOS camera) could never resolve
 * against a store keyed on the bare 12 digits unless the product happened to be
 * materialized locally. Check-digit normalization is still future work.
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

	// EXACT only against `input.index`. That map may be the all-fields index from
	// buildLocalBarcodeIndex, which includes `sku`, and an entry carries no field
	// provenance — so probing equivalent forms here would hand a numeric stock
	// code the `0`-prefixed twin that barcodeMatchCandidates explicitly forbids,
	// resolving a scan to an unrelated product. Equivalent-form matching belongs
	// to use-barcode-search, which knows the store's declared barcode carrier;
	// this flow is invoked with an empty index and exists to drive the online
	// resolve below.
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

	// Seeded not-found rather than null: barcodeMatchCandidates always yields at
	// least the scanned code, so the loop always assigns — the seed keeps the type
	// honest without an unreachable branch to explain.
	let body: ResolveBarcodeResponse = { code, found: false, match: null, ambiguous: [] };
	// Only a clean `found:false` advances to the next form: a transport error or a
	// non-2xx is terminal for the whole scan, so a dead network costs one request
	// rather than one per candidate. The caller's lookup deadline spans the whole
	// loop (see withBarcodeLookupDeadline) — a slow first probe eats into the
	// budget instead of granting the retry a fresh one.
	for (const candidate of barcodeMatchCandidates(code)) {
		const url = buildResolveBarcodeUrl({
			syncBaseUrl: input.syncBaseUrl,
			code: candidate,
			profile: input.profile,
		});
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
		if (body.found) {
			break;
		}
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

// The bench instrument that measured this (runner, profile parsing, summary
// stats, markdown rendering) was never ported from the lab repo — there is no
// ./bench sub-path in this package. This module keeps only the engine: the
// local index and the awaited scan flow.
