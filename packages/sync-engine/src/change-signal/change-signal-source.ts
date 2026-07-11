/**
 * Package-private live ChangeSignalSource (facade slice 3) — the ONE place the
 * hybrid engine's detection port meets HTTP inside the engine package. Ported
 * from the web host's adapter (apps/web/src/bench/hybridEngineLiveSource.ts,
 * which remains in place until host adoption #430 deletes it); the mapping is
 * pure request + project, and the ChangeSignalPoisonError guard means a WP
 * error/HTML/maintenance page can NEVER advance the cursor (ADR 0017 P2L-3d).
 */
import type {
	ChangeSignalSource,
	DriftedId,
	HashChecksumBucket,
	HybridCollection,
	RangeChecksumBucket,
	SequenceLogRow,
} from '@wcpos/sync-core';

/** RAW fetcher contract — the engine binds scope tickets before handing it here. */
export type EngineSourceFetcher = (
	url: string,
	init?: { signal?: AbortSignal }
) => Promise<Response>;

export type CreateLiveChangeSignalSourceInput = {
	/** e.g. http://wcpos.local/wp-json/wc-rxdb-sync/v1 (no trailing slash). */
	syncBaseUrl: string;
	/** Already-authenticated fetcher (auth header injected upstream). */
	fetcher: EngineSourceFetcher;
};

// --- Envelope plumbing (self-contained; the matrix helper is AdapterContext-
// coupled — tally, fixed collection, profile — and not exported). Kept minimal
// and pure: build URL, GET, parse the shared envelope. ----------------------

type ChangesEnvelope<Row> = {
	candidate?: string;
	collection?: string;
	checkpoint?: Record<string, unknown>;
	changes: Row[];
	complete?: boolean;
	meta?: { duration_ms?: number; supported?: boolean; note?: string };
};

function buildUrl(syncBaseUrl: string, path: string, params: Record<string, string>): string {
	const search = new URLSearchParams(params);
	const query = search.toString();
	return `${syncBaseUrl}${path}${query === '' ? '' : `?${query}`}`;
}

/**
 * A change-signal response that is NOT a valid changes envelope — a WP error/HTML/maintenance page, a non-2xx
 * status, a non-JSON body, or JSON missing the `changes` array. Thrown by `getEnvelope` (ADR 0017, P2L-3d)
 * so the cursor can NEVER advance from a poison response: the engine only advances on a shape-valid page, and
 * a thrown error leaves the cursor exactly where it was for the next poll to retry.
 */
export class ChangeSignalPoisonError extends Error {
	constructor(
		message: string,
		readonly path: string,
		readonly status?: number
	) {
		super(message);
		this.name = 'ChangeSignalPoisonError';
	}
}

async function getEnvelope<Row>(
	input: CreateLiveChangeSignalSourceInput,
	path: string,
	params: Record<string, string>
): Promise<ChangesEnvelope<Row>> {
	const label = path.replace(/^\//, '');
	const url = buildUrl(input.syncBaseUrl, path, params);
	const response = await input.fetcher(url);
	if (!response.ok) {
		throw new ChangeSignalPoisonError(
			`${label} failed: HTTP ${response.status}`,
			path,
			response.status
		);
	}
	// A WP maintenance/error page is often served as 200 text/html — reject a declared non-JSON body BEFORE
	// parsing, so it can never be read as a valid (empty) change page that would advance the cursor past
	// unfetched changes. (A missing content-type is tolerated; the parse + shape guards below still catch it.)
	const contentType = response.headers.get('content-type') ?? '';
	if (contentType !== '' && !contentType.toLowerCase().includes('application/json')) {
		throw new ChangeSignalPoisonError(
			`${label}: non-JSON response (content-type: ${contentType})`,
			path,
			response.status
		);
	}
	const body = await response.text();
	let parsed: unknown;
	try {
		parsed = JSON.parse(body);
	} catch {
		throw new ChangeSignalPoisonError(
			`${label}: response body is not valid JSON`,
			path,
			response.status
		);
	}
	// Shape guard: a valid-JSON but non-envelope body (e.g. a WP REST error `{ code, message }`) must not be
	// treated as an empty page. Require the `changes` array before the source builds rows/cursor from it.
	if (
		typeof parsed !== 'object' ||
		parsed === null ||
		!Array.isArray((parsed as { changes?: unknown }).changes)
	) {
		throw new ChangeSignalPoisonError(
			`${label}: not a changes envelope (missing 'changes' array)`,
			path,
			response.status
		);
	}
	return parsed as ChangesEnvelope<Row>;
}

/** Read a checkpoint scalar (string|number) off the envelope, defaulting. */
function checkpointNumber(
	envelope: ChangesEnvelope<unknown>,
	field: string,
	fallback: number
): number {
	const value = envelope.checkpoint?.[field];
	if (typeof value === 'number' && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
		return Number(value);
	}
	return fallback;
}

/** Map an endpoint collection (sequence-log/range-checksum) to the engine's
 * default per-detector collection for a drill-down request. */
function endpointCollectionFor(collection: HybridCollection): 'products' | 'tax_rates' {
	return collection === 'tax_rates' ? 'tax_rates' : 'products';
}

/** Map the server's per-row collection string to a HybridCollection, or
 * undefined when absent/unknown (the row is then dropped at this boundary —
 * the engine never guesses a row's collection). */
const SUPPORTED_HYBRID_COLLECTIONS: ReadonlySet<string> = new Set<HybridCollection>([
	'products',
	'variations',
	'tax_rates',
	'customers',
	'coupons',
	'categories',
	'brands',
	'tags',
]);

function toHybridCollection(value: string | undefined): HybridCollection | undefined {
	return value !== undefined && SUPPORTED_HYBRID_COLLECTIONS.has(value)
		? (value as HybridCollection)
		: undefined;
}

// --- Raw row shapes the controllers emit ------------------------------------

type RawSequenceLogRow = {
	sequence: number;
	id: number;
	type: string;
	collection?: string;
	modified_gmt?: string;
};
type RawHashChecksumBucketRow = {
	bucket: number;
	range: { start: number; end: number };
	stored_count: number;
	current_count: number;
	stored_digest: string;
	current_digest: string;
	match: boolean;
};
type RawHashDrillRow = {
	id: number;
	status: 'changed' | 'missing_stored' | 'deleted';
	collection?: string;
	stored_digest: string | null;
	current_digest: string | null;
};
type RawRangeChecksumRow = { bucket: number; record_count: number; checksum: string };
type RawRangeDrillRow = { id: number };
type RawRevisionHashRow = { id: number; revision: string };

/**
 * Builds the live ChangeSignalSource the hybrid engine consumes. Pure mapping:
 * no engine logic, no policy, no retries — every method is request + project.
 */
export function createLiveChangeSignalSource(
	input: CreateLiveChangeSignalSourceInput
): ChangeSignalSource {
	return {
		// TIER 1 — GET /changes/sequence-log?since=<cursor.sequence>&limit=<limit>.
		// NB the wire param is `since` (absint), NOT `after_sequence`; the checkpoint
		// echoes the new high-water sequence under `checkpoint.since`. `complete`
		// false means the page was capped — another drain is needed.
		async pollSequenceLog({ cursor, limit }) {
			// UNIFIED stream (`collection=all`): the change-log `sequence` is a single
			// global AUTO_INCREMENT across every object_type, so ONE cursor drains
			// products, variations AND tax rates in one request — globally ordered,
			// each row tagged with its `collection`. This is why the engine's TIER 1
			// single-cursor model is correct as-is: there are no separate per-
			// collection streams to merge. (The per-collection `collection=products|
			// tax_rates` modes remain for the matrix; the engine uses `all`.)
			const envelope = await getEnvelope<RawSequenceLogRow>(input, '/changes/sequence-log', {
				collection: 'all',
				since: String(cursor.sequence),
				limit: String(limit),
			});
			// THE boundary mapping: the server tags every unified-stream row with a
			// `collection` derived from its internal object_type
			// (class-changes-controller.php collection_for_object_type); this adapter
			// maps that wire field onto SequenceLogRow.collection — the row's single,
			// REQUIRED collection tag — so the engine reads it directly and never
			// guesses. Rows whose collection is absent or unrecognised are DROPPED:
			// the `all` stream always tags rows, so absent cannot happen live; an
			// unknown/future collection (or a typo) must not be mis-mapped to some
			// default, which would pull/tombstone the WRONG record type with the
			// changed record's numeric id. The cursor still advances past dropped
			// rows via the server's echoed `since`, so they are never re-fetched.
			const rows: SequenceLogRow[] = [];
			for (const row of envelope.changes) {
				const collection = toHybridCollection(row.collection);
				if (collection === undefined) {
					continue;
				}
				rows.push({
					sequence: row.sequence,
					id: row.id,
					type: row.type,
					collection,
					modified_gmt: row.modified_gmt,
				});
			}
			const echoed = checkpointNumber(envelope, 'since', cursor.sequence);
			const maxSeen = rows.reduce((max, row) => Math.max(max, row.sequence), cursor.sequence);
			return {
				rows,
				cursor: { sequence: Math.max(echoed, maxSeen) },
				hasMore: envelope.complete === false,
			};
		},

		// TIER 2 (products) — GET /integrity/scan?bucket_size=&after_id=&limit_buckets=.
		// `changes` ARE the HashChecksumBucket rows already (shape matches exactly);
		// the next page's afterId is `checkpoint.after_id`.
		async hashChecksumScan({ bucketSize, afterId, limitBuckets }) {
			const envelope = await getEnvelope<RawHashChecksumBucketRow>(input, '/integrity/scan', {
				bucket_size: String(bucketSize),
				after_id: String(afterId),
				limit_buckets: String(limitBuckets),
			});
			const buckets: HashChecksumBucket[] = envelope.changes.map((row) => ({
				bucket: row.bucket,
				range: row.range,
				stored_count: row.stored_count,
				current_count: row.current_count,
				stored_digest: row.stored_digest,
				current_digest: row.current_digest,
				match: row.match,
			}));
			return {
				buckets,
				complete: envelope.complete === true,
				nextAfterId: checkpointNumber(envelope, 'after_id', afterId),
			};
		},

		// TIER 2 (tax rates) — GET /changes/range-checksum?collection=&bucket_size=.
		// Single pass; `changes` carry {bucket,record_count,checksum}. The endpoint
		// exposes no per-bucket ids here (those come from the drill-down).
		async rangeChecksumScan({ collection, bucketSize }) {
			const envelope = await getEnvelope<RawRangeChecksumRow>(input, '/changes/range-checksum', {
				collection: endpointCollectionFor(collection),
				bucket_size: String(bucketSize),
			});
			const buckets: RangeChecksumBucket[] = envelope.changes.map((row) => ({
				bucket: row.bucket,
				record_count: row.record_count,
				checksum: row.checksum,
			}));
			return { buckets };
		},

		// TIER 3 — drill down one flagged bucket. The detector selects the endpoint:
		//   hash-checksum  → GET /integrity/scan?bucket_size=&bucket=  ({id,status})
		//   range-checksum → GET /changes/range-checksum?collection=&bucket_size=&bucket=
		//                    (present ids in the bucket; status defaults to 'changed')
		// The hash-checksum id-space (wp_posts) holds BOTH products and variations, so
		// the drill-down tags each drifted id with its collection (ADR 0005 — the server
		// maps post_type to the engine's collection); the engine pulls the right path.
		// Absent/unknown falls back to the detector default (products).
		async drillDownBucket({ detector, collection, bucketSize, bucket }) {
			if (detector === 'hash-checksum') {
				const envelope = await getEnvelope<RawHashDrillRow>(input, '/integrity/scan', {
					bucket_size: String(bucketSize),
					bucket: String(bucket),
				});
				const driftedIds: DriftedId[] = envelope.changes.map((row) => ({
					id: row.id,
					status: row.status,
					collection: toHybridCollection(row.collection),
				}));
				return { driftedIds };
			}

			// range-checksum drill-down: the endpoint returns the ids PRESENT in the
			// bucket. The engine treats a non-empty drill set as the targeted pull and
			// (for an empty set against a vanished bucket) falls back to the retained
			// baseline ids as deletes. Present ids are reported as 'changed'.
			const envelope = await getEnvelope<RawRangeDrillRow>(input, '/changes/range-checksum', {
				collection: endpointCollectionFor(collection),
				bucket_size: String(bucketSize),
				bucket: String(bucket),
			});
			const driftedIds: DriftedId[] = envelope.changes.map((row) => ({
				id: row.id,
				status: 'changed',
			}));
			return { driftedIds };
		},

		// TIER 3 (deepest, on-demand) — GET /changes/revision-hash?collection=&since_id=&limit=.
		// The endpoint PAGES by since_id over the whole id space; there is NO ids=csv
		// filter, so we drain pages and keep only the requested ids. Bounded by the
		// caller's id set (escalation is rare and small).
		async revisionHashForIds({ ids, collection }) {
			if (ids.length === 0) {
				return { rows: [] };
			}
			const wanted = new Set(ids);
			const maxWanted = Math.max(...ids);
			const rows: { id: number; revision: string }[] = [];
			const limit = 200;
			let sinceId = Math.min(...ids) - 1;
			// Drain forward from just-below the smallest wanted id until every wanted
			// id is collected or the scan passes the largest wanted id / completes.
			for (;;) {
				const envelope = await getEnvelope<RawRevisionHashRow>(input, '/changes/revision-hash', {
					collection: endpointCollectionFor(collection),
					since_id: String(Math.max(0, sinceId)),
					limit: String(limit),
				});
				let pageMax = sinceId;
				for (const row of envelope.changes) {
					pageMax = Math.max(pageMax, row.id);
					if (wanted.has(row.id)) {
						rows.push({ id: row.id, revision: row.revision });
					}
				}
				const collectedAll = ids.every((id) => rows.some((row) => row.id === id));
				if (
					collectedAll ||
					envelope.complete === true ||
					envelope.changes.length === 0 ||
					pageMax >= maxWanted ||
					pageMax === sinceId
				) {
					return { rows };
				}
				sinceId = pageMax;
			}
		},
	};
}
