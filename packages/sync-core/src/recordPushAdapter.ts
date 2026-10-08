import { type MetaDataEntry, readRecordUuid } from './recordIdentity';
import { type SyncEvent, type SyncObserver } from './telemetry';
import { mapBarcodeEditToPayload } from './barcodeResolve';
import { mapCouponExpiryToPayload } from './couponWirePayload';
import { type RemoteId, remoteIdOrNull } from './woo/remoteIdCodec';

import type { RecordMutation } from './recordMutation';

/**
 * The generic idempotent push adapter (P1-1) — pushes ONE `RecordMutation` of any
 * collection to the server and reports a structured outcome. Transport-agnostic:
 * the per-collection endpoint is injected (`resolveEndpoint`), so this builds and
 * unit-tests independently of the server write surface (P1-0). The drain loop that
 * walks `RecordMutationQueue.pending()` and `acknowledge`s on success layers on top.
 *
 * It also wires the PUSH seam of the telemetry spine (the gap P0-2 still had): every
 * attempt emits `push.outcome` / `push.conflict` / `push.error`, best-effort so a
 * throwing observer can never break a push.
 */

export type PushOutcome = 'created' | 'updated' | 'deleted' | 'conflict';

export const WOO_REST_CANNOT_DELETE = 'woocommerce_rest_cannot_delete';

export type PushEndpoint = { url: string; method: string };

/** Routes a mutation to its per-collection endpoint + verb. Injected by the host. */
export type EndpointResolver = (mutation: RecordMutation) => PushEndpoint;

/**
 * The canonical resolver for the versioned WCPOS write surface: every mutation
 * POSTs to `{syncBase}/push/{collection}`, dispatched server-side on the
 * envelope's operation. `syncBaseUrl` is the namespaced sync base (for example,
 * `https://shop.example/wp-json/wcpos/v2`; trailing slash optional).
 */
export function pushEndpointResolver(syncBaseUrl: string): EndpointResolver {
	// Trim trailing slashes linearly (a `/\/+$/` regex is flagged as ReDoS-prone).
	let base = syncBaseUrl;
	while (base.endsWith('/')) base = base.slice(0, -1);
	return (mutation) => ({
		url: `${base}/push/${encodeURIComponent(mutation.collectionName)}`,
		method: 'POST',
	});
}

export type ServerDocument = Record<string, unknown> & {
	id?: unknown;
	meta_data?: MetaDataEntry[];
};

export type PushResult = {
	outcome: PushOutcome;
	mutation: RecordMutation;
	/**
	 * The raw HTTP status of the server's answer (absent on a drain-synthesized
	 * result). Load-bearing for creates (gate2 #516 item 1): 201 = the server
	 * APPLIED this payload; 200 = the born-twice guard matched an EXISTING
	 * document and the pushed payload was IGNORED — the ack consumer must
	 * reconcile that difference honestly (see the write-drain lane's follow-up
	 * requeue). This outcome-code comparison is deliberately preferred over a
	 * field-by-field / digest diff of the returned document: the ack document is
	 * a trimmed projection, so a client-side diff would false-positive on every
	 * create, while the status is the server's own verdict on whether the
	 * payload was applied.
	 */
	httpStatus?: number;
	/** The server record after a successful create/update (for reconciliation); `null` for a delete or conflict. */
	document: ServerDocument | null;
	/**
	 * The record's canonical revision AFTER this write — store it as the `baseRevision`
	 * for the NEXT update of this record so optimistic-concurrency works. `null` for a
	 * delete or when the server omitted it.
	 */
	currentRevision: string | null;
	/** Present only on a 409 conflict — the server's current state to drive resolution. */
	conflict?: { current: ServerDocument | null; currentRevision: string | null };
};

export class RecordPushError extends Error {
	public readonly mutation: RecordMutation;
	public readonly status: number;
	public readonly reason?: string;
	/**
	 * `true` when this failure can NEVER succeed by retrying (e.g. a 409
	 * `identity_ambiguous` — the server refuses to resolve a duplicated uuid until the
	 * backfill collision repair runs). The drain dead-letters these instead of retrying,
	 * even when the bare status (409) would otherwise look transient.
	 */
	public readonly permanent: boolean;
	/**
	 * The server's human-readable `message` from the error body, when it sent one
	 * (WP REST errors are `{ code, message, data }`). `reason` is the machine code
	 * — `rest_invalid_param` — while this is the sentence a cashier can act on —
	 * "Invalid parameter(s): billing". The drain persists it on a dead-lettered
	 * row so the recovery surface can say WHY the sale never reached the server
	 * (#832); nothing branches on it.
	 */
	public readonly serverMessage?: string;
	public constructor(
		mutation: RecordMutation,
		status: number,
		reason?: string,
		permanent = false,
		serverMessage?: string
	) {
		super(
			`push ${mutation.operation} ${mutation.collectionName}/${mutation.recordId} failed: ${status}${reason ? ` (${reason})` : ''}`
		);
		this.name = 'RecordPushError';
		this.mutation = mutation;
		this.status = status;
		this.reason = reason;
		this.permanent = permanent;
		this.serverMessage = serverMessage;
	}
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

const OUTCOME_BY_OP: Record<RecordMutation['operation'], Exclude<PushOutcome, 'conflict'>> = {
	create: 'created',
	update: 'updated',
	delete: 'deleted',
};

export async function pushRecordMutation(input: {
	mutation: RecordMutation;
	resolveEndpoint: EndpointResolver;
	/**
	 * The transport port — REQUIRED, never defaulted to the global `fetch`. A silent
	 * global fallback hides the host's transport dependency and binds web semantics
	 * into the engine (React Native / worker hosts must inject their own).
	 */
	fetcher: Fetcher;
	signal?: AbortSignal;
	observe?: SyncObserver;
	/**
	 * Extract the record from a successful response body, defaulting to the body
	 * itself (a bare wc/v3-shaped record). Inject this to unwrap an enveloped shape
	 * (e.g. the legacy `/orders/push` returns `{ document: … }`).
	 */
	extractDocument?: (body: Record<string, unknown>) => ServerDocument | null;
	/**
	 * The barcode carriers active for THIS mutation's collection, read from the
	 * scope the mutation belongs to (products/variations only — see
	 * `deriveBarcodeFromPayload`). Omitted (or empty) means the scope has no
	 * carriers yet, and the materialized `barcode` field is dropped rather than
	 * written to a guessed field.
	 */
	barcodeSelectors?: readonly string[];
}): Promise<PushResult> {
	const { mutation } = input;
	const emit = (event: SyncEvent): void => {
		try {
			input.observe?.(event);
		} catch {
			// best-effort: telemetry must never break the push.
		}
	};
	const baseFields = {
		op: mutation.operation,
		recordId: mutation.recordId,
		mutationId: mutation.mutationId,
	};

	const endpoint = input.resolveEndpoint(mutation);
	// Send the full mutation ENVELOPE, not just the payload: the server needs the
	// mutationId to dedupe an offline retry (idempotency), the operation to route, and
	// baseRevision for optimistic concurrency. A delete carries no payload.
	const envelope: Record<string, unknown> = {
		mutationId: mutation.mutationId,
		operation: mutation.operation,
		collection: mutation.collectionName,
		recordId: mutation.recordId,
		baseRevision: mutation.baseRevision,
	};
	if (mutation.operation !== 'delete') {
		if (mutation.collectionName === 'products' || mutation.collectionName === 'variations') {
			envelope.payload = mapBarcodeEditToPayload(mutation.payload, input.barcodeSelectors ?? []);
		} else if (mutation.collectionName === 'coupons') {
			envelope.payload = mapCouponExpiryToPayload(mutation.payload);
		} else {
			envelope.payload = mutation.payload;
		}
	}
	// Standard-header MIRROR of the canonical body (ADR 0011): Idempotency-Key = mutationId, and when there's a
	// base revision (updates/deletes) If-Match = the quoted baseRevision (an RFC 9110 entity-tag). The body stays
	// authoritative — the server only cross-checks these (422 on divergence). Creates carry no base revision.
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		'Idempotency-Key': mutation.mutationId,
	};
	// Only a string revision → If-Match. baseRevision is optional in the durable queue schema, so a restored
	// entry can be `undefined`; sending `If-Match: "undefined"` (while JSON.stringify drops it from the body)
	// would trip the server mirror's 422. typeof guards null AND undefined.
	if (typeof mutation.baseRevision === 'string') {
		headers['If-Match'] = `"${mutation.baseRevision}"`;
	}
	const init: RequestInit = {
		method: endpoint.method,
		headers,
		body: JSON.stringify(envelope),
	};
	if (input.signal) {
		init.signal = input.signal;
	}

	let response: Response;
	try {
		response = await input.fetcher(endpoint.url, init);
	} catch (error) {
		// A transport-level rejection (network down, DNS, an abort) escapes before any
		// HTTP status — instrument it too. An abort is expected (a store switch cancels
		// in-flight pushes), so it is warn, not error; both rethrow for the caller.
		const aborted =
			input.signal?.aborted === true || (error instanceof Error && error.name === 'AbortError');
		emit({
			type: aborted ? 'push.aborted' : 'push.error',
			level: aborted ? 'warn' : 'error',
			collection: mutation.collectionName,
			fields: {
				...baseFields,
				reason: error instanceof Error ? error.name : 'unknown',
				...(error instanceof Error ? { message: error.message.slice(0, 200) } : {}),
				phase: 'transport',
			},
		});
		throw error;
	}

	if (response.status === 409) {
		const body = await safeJson(response);
		// Two TRANSIENT 409s — another writer holds the mutation reservation
		// (`in_progress`) or the record's advisory lock (`record_locked`, the per-record CAS
		// serialisation) — are NOT an optimistic-concurrency conflict to resolve. Throw so
		// the drain leaves the mutation queued to retry on the next drain (the lock/reservation
		// frees), instead of surfacing a permanent conflict the host would try to reconcile.
		if (
			body?.code === 'woo_rxdb_sync_in_progress' ||
			body?.code === 'woo_rxdb_sync_record_locked'
		) {
			const reason = body.code === 'woo_rxdb_sync_record_locked' ? 'record-locked' : 'in-progress';
			emit({
				type: 'push.in_progress',
				level: 'warn',
				collection: mutation.collectionName,
				fields: baseFields,
			});
			throw new RecordPushError(mutation, 409, reason);
		}
		// A PERMANENT 409 — `identity_ambiguous` (F4a): the record's uuid resolves to MORE THAN
		// ONE server record, so the server fails closed rather than write an arbitrary match.
		// This is NOT an optimistic-concurrency conflict (there is no `current` to rebase on)
		// and NOT transient (a duplicated uuid needs the backfill collision repair) — treating
		// it as either would loop the mutation forever. Throw a permanent error so the drain
		// dead-letters it with the failure surfaced.
		if (body?.code === 'woo_rxdb_sync_identity_ambiguous') {
			emit({
				type: 'push.error',
				level: 'error',
				collection: mutation.collectionName,
				fields: { ...baseFields, status: 409, reason: 'identity-ambiguous' },
			});
			throw new RecordPushError(
				mutation,
				409,
				'identity-ambiguous',
				true,
				readServerMessage(body, 409)
			);
		}
		emit({
			type: 'push.conflict',
			level: 'warn',
			collection: mutation.collectionName,
			fields: baseFields,
		});
		return {
			outcome: 'conflict',
			mutation,
			httpStatus: response.status,
			document: null,
			currentRevision: null, // no write happened on a conflict
			conflict: {
				current: (body?.current as ServerDocument) ?? null,
				currentRevision: typeof body?.currentRevision === 'string' ? body.currentRevision : null,
			},
		};
	}

	if (response.status === 428) {
		// Precondition required — THROW so the drain's refreshRevision recovery
		// runs for EVERY operation, deletes included (gate2 #516 item 4). The old
		// delete-only mapping to a null-truth conflict result bypassed that
		// recovery and parked an unresolvable row (no `current`, no revision).
		const body = await safeJson(response);
		emit({
			type: 'push.error',
			level: 'warn',
			collection: mutation.collectionName,
			fields: { ...baseFields, status: 428, reason: 'precondition-required' },
		});
		throw new RecordPushError(
			mutation,
			428,
			typeof body?.code === 'string' ? body.code : 'precondition-required',
			false,
			readServerMessage(body, 428)
		);
	}

	if (!response.ok) {
		const body = await safeJson(response);
		const reason = typeof body?.code === 'string' ? body.code : undefined;
		const serverMessage = readServerMessage(body, response.status);
		emit({
			type: 'push.error',
			// The plugin's 401 means no user is logged in; the write drain reports
			// queue.write.session-refused once instead of once per push.
			level: response.status === 401 ? 'warn' : 'error',
			collection: mutation.collectionName,
			fields: {
				...baseFields,
				status: response.status,
				...(reason !== undefined ? { reason } : {}),
				// The server's own sentence rides the event so the ledger row can quote
				// it: a 500 is retried, never dead-lettered, so this event is the ONLY
				// place the row's "why" can come from (#2439).
				...(serverMessage !== undefined ? { serverMessage } : {}),
			},
		});
		throw new RecordPushError(
			mutation,
			response.status,
			reason,
			reason === WOO_REST_CANNOT_DELETE,
			serverMessage
		);
	}

	const outcome = OUTCOME_BY_OP[mutation.operation];
	let document: ServerDocument | null = null;
	let currentRevision: string | null = null;
	if (mutation.operation !== 'delete') {
		const body = await safeJson(response);
		// Distinguish our { document, currentRevision } envelope from a BARE record by the
		// presence of `currentRevision` — so a bare record that happens to carry its own
		// top-level `document` field is NOT mis-unwrapped.
		const isEnvelope = body !== null && 'currentRevision' in body;
		try {
			// A host may override extraction; otherwise unwrap the envelope, or take the bare
			// record as-is (e.g. a back-compat endpoint that doesn't envelope).
			document =
				body === null
					? null
					: input.extractDocument
						? input.extractDocument(body)
						: isEnvelope
							? (body.document as ServerDocument)
							: (body as ServerDocument);
		} catch {
			// A throwing host extractor must not exit a successful HTTP push silently —
			// instrument it like any other unusable ack, then fail fast.
			emit({
				type: 'push.error',
				level: 'error',
				collection: mutation.collectionName,
				fields: { ...baseFields, status: response.status, reason: 'extract-failed' },
			});
			throw new RecordPushError(mutation, response.status, 'extract-failed');
		}
		// A create/update that 2xx'd but returned no parseable record can't be
		// reconciled (no server id, no uuid to verify) — fail fast so the drain leaves
		// it queued to retry rather than acknowledging a write it can't follow up.
		if (document === null) {
			emit({
				type: 'push.error',
				level: 'error',
				collection: mutation.collectionName,
				fields: { ...baseFields, status: response.status, reason: 'no-document' },
			});
			throw new RecordPushError(mutation, response.status, 'no-document');
		}
		currentRevision =
			isEnvelope && body && typeof body.currentRevision === 'string'
				? (body.currentRevision as string)
				: null;
	} else if (response.status !== 204) {
		// A delete has no record to return, but an HTML host challenge at 2xx must not
		// acknowledge a delete the server never ran. The plugin answers with {}.
		const body = await safeJson(response);
		if (body === null || typeof body !== 'object' || Array.isArray(body)) {
			emit({
				type: 'push.error',
				level: 'error',
				collection: mutation.collectionName,
				fields: { ...baseFields, status: response.status, reason: 'no-document' },
			});
			throw new RecordPushError(mutation, response.status, 'no-document');
		}
	}
	emit({
		type: 'push.outcome',
		level: 'info',
		collection: mutation.collectionName,
		fields: { ...baseFields, outcome },
	});
	return { outcome, mutation, httpStatus: response.status, document, currentRevision };
}

async function safeJson(response: Response): Promise<Record<string, unknown> | null> {
	try {
		return (await response.json()) as Record<string, unknown>;
	} catch {
		return null;
	}
}

/**
 * The server's own sentence for a refused push, read from a WP REST error body.
 *
 * A WordPress fatal (memory exhausted, a plugin's uncaught exception) answers
 * 500 as `{ code: 'internal_server_error', message: '<p>There has been a
 * critical error on this website.</p>…' }` — the top-level `message` is the
 * localized boilerplate and names nothing. When the site exposes error details,
 * the PHP error itself rides in `data.error` in the `error_get_last()` shape
 * `{ type, message, file, line }`, and THAT sentence ("Allowed memory size of
 * 134217728 bytes exhausted") is the answer support needs, so it wins over the
 * boilerplate with `file:line` appended the way PHP reports a fatal. Sites that
 * hide error details send no `data.error`, so the top-level message stays the
 * fallback (#2439). `readWpFatalDetail` in `@wcpos/hooks` parse-wp-error reads
 * the same shape for the axios lanes; sync-core stays dependency-free, so the
 * two are kept in step by hand.
 */
export function readServerMessage(
	body: Record<string, unknown> | null,
	status: number
): string | undefined {
	if (body === null) return undefined;
	// Only a 5xx is a fatal. A 4xx may carry a caller-defined `data.error` object
	// of its own (a gateway diagnostic under a validation message), and there the
	// top-level message is the one written for the cashier.
	const fatal = status >= 500 ? readWpFatalDetail(body.data) : undefined;
	if (fatal !== undefined) return fatal;
	if (typeof body.message !== 'string') return undefined;
	const message = stripTags(body.message);
	return message.length > 0 ? message : undefined;
}

/**
 * The ledger observer (`sanitizeReason`) caps a quoted sentence at 200
 * characters, cutting from the END — exactly where the location is appended.
 * The whole sentence is therefore built to fit under it: the location is sized
 * first (shortened to its file name when even the WordPress-relative path is
 * long), and the PHP message takes whatever is left. A fatal's first line is a
 * sentence, but an uncaught exception's `message` runs on into a stack trace,
 * so only the first line is quoted.
 */
const QUOTE_CAP = 200;
/** The location may not squeeze the message below this; past it the path drops to its file name. */
const MIN_MESSAGE_CHARS = 80;

function readWpFatalDetail(data: unknown): string | undefined {
	if (data === null || typeof data !== 'object') return undefined;
	const error = (data as Record<string, unknown>).error;
	if (error === null || typeof error !== 'object') return undefined;
	const { message: raw, file, line } = error as Record<string, unknown>;
	if (typeof raw !== 'string') return undefined;
	const firstLine = stripTags(raw.split('\n')[0] ?? '');
	if (firstLine === '') return undefined;
	const location = typeof file === 'string' && file !== '' ? fatalLocation(file, line) : '';
	const budget = Math.max(QUOTE_CAP - location.length, MIN_MESSAGE_CHARS);
	const message = firstLine.length > budget ? `${firstLine.slice(0, budget - 1)}…` : firstLine;
	return `${message}${location}`;
}

/**
 * ` in wp-includes/class-wpdb.php:2324`. Everything before the WordPress root
 * (`/home/u123/domains/shop.example/public_html/`) is the host's directory
 * layout, which says nothing about the fault and eats the quote budget, so the
 * path starts at `wp-content/`, `wp-includes/` or `wp-admin/`; a path outside
 * those roots, or one still too long to leave the message its minimum, keeps
 * only its file name — the line number always survives.
 */
function fatalLocation(file: string, line: unknown): string {
	const suffix =
		typeof line === 'number' || (typeof line === 'string' && line !== '') ? `:${line}` : '';
	// A Windows host reports `C:\inetpub\wwwroot\wp-includes\class-wpdb.php`.
	const path = file.split('\\').join('/');
	const slash = path.lastIndexOf('/');
	const fileName = slash === -1 ? path : path.slice(slash + 1);
	const maxLocation = QUOTE_CAP - MIN_MESSAGE_CHARS;
	for (const root of ['/wp-content/', '/wp-includes/', '/wp-admin/']) {
		const at = path.indexOf(root);
		if (at === -1) continue;
		const location = ` in ${path.slice(at + 1)}${suffix}`;
		if (location.length <= maxLocation) return location;
		break;
	}
	const location = ` in ${fileName}${suffix}`;
	if (location.length <= maxLocation) return location;
	// Even the file name is absurd: keep its tail (extension) and the line number.
	const room = maxLocation - ` in …${suffix}`.length;
	return ` in …${fileName.slice(fileName.length - room)}${suffix}`;
}

/**
 * WordPress ships its error copy as HTML — the critical-error boilerplate is
 * `<p>…</p><p><a href="…">Learn more…</a></p>` — and the sentence is quoted on a
 * ledger row and in toasts, where tags would render literally. Entities are left
 * alone: the renderer decodes them.
 */
function stripTags(html: string): string {
	// A linear scan rather than a `<[^>]*>` regex: on server-controlled input that
	// regex is polynomial on a run of `<` (CodeQL js/polynomial-redos), and the
	// scan keeps a lone `<` with no closing `>` as the literal it is.
	let text = '';
	let cursor = 0;
	while (cursor < html.length) {
		const open = html.indexOf('<', cursor);
		if (open === -1) {
			text += html.slice(cursor);
			break;
		}
		const close = html.indexOf('>', open + 1);
		if (close === -1) {
			text += html.slice(cursor);
			break;
		}
		text += `${html.slice(cursor, open)} `;
		cursor = close + 1;
	}
	return text.replace(/\s+/g, ' ').trim();
}

/**
 * Resolve a create ack (`awaitingRemoteCreateUUID`): the server reuses the
 * client-minted `_woocommerce_pos_uuid` (#219), so the record is NEVER re-keyed.
 * Returns the stable `recordId` (unchanged) and the server-assigned `remoteId` to
 * store as a field on the uuid-keyed record. Throws if the server came back with a
 * DIFFERENT uuid — that is a broken identity contract, not a reconciliation.
 */
export function reconcileCreateAck(
	mutation: RecordMutation,
	document: ServerDocument | null
): { recordId: string; remoteId: RemoteId | null } {
	const serverUuid = readRecordUuid(document?.meta_data ?? null);
	if (serverUuid && serverUuid !== mutation.recordId) {
		throw new Error(
			`reconcileCreateAck: server returned uuid "${serverUuid}" for a create keyed "${mutation.recordId}" — identity must never be re-keyed.`
		);
	}
	return { recordId: mutation.recordId, remoteId: remoteIdOrNull(document?.id) };
}
