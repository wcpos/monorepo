import { classifyEmailSendError, type EmailSendFailure } from './classify';

import type { Observable } from 'rxjs';

/**
 * The durable receipt-email queue (#165).
 *
 * A cashier who taps Send while the till is offline expects the email to go out
 * later, not to vanish. This module owns that promise: the tap writes a row,
 * and the drain — triggered on app start and on connectivity restore — walks
 * the rows in order and posts them.
 *
 * Deliberately NOT part of the engine's record-mutation queue. That queue's
 * contract is document sync: a local record whose state the server converges
 * on, with conflicts, coalescing and dead letters. An email is a one-shot
 * action with none of those semantics, and giving it a corner of the mutation
 * queue would mean teaching that queue a second contract.
 *
 * Delivery is at-least-once, not exactly-once. A send whose response is lost in
 * transit (the server accepted, the till never heard) is indistinguishable here
 * from a send that never landed, so it is retried and the customer may receive
 * a second copy. Exactly-once would need an idempotency key the plugin honours;
 * a duplicate receipt is the benign side of that trade, a silently-dropped one
 * is not.
 */

export type ReceiptEmailStatus = 'pending' | 'sent' | 'failed';

export interface ReceiptEmailRow {
	localID: string;
	orderId: number;
	orderNumber?: string;
	email: string;
	saveTo?: string;
	status: ReceiptEmailStatus;
	queuedAt: string;
	attempts: number;
	nextAttemptAt?: string;
	lastAttemptAt?: string;
	sentAt?: string;
	lastError?: string;
	lastErrorCode?: string;
}

/**
 * The slice of an RxDocument this module touches. Structural on purpose: the
 * drain is the part worth testing hardest, and a port keeps its tests free of
 * a real storage engine.
 */
export interface ReceiptEmailDoc extends ReceiptEmailRow {
	readonly deleted: boolean;
	incrementalPatch(patch: Partial<ReceiptEmailRow>): Promise<unknown>;
	remove(): Promise<unknown>;
}

export interface ReceiptEmailQueuePort {
	insert(row: ReceiptEmailRow): Promise<unknown>;
	find(query: { selector: Record<string, unknown> }): {
		exec(): Promise<ReceiptEmailDoc[]>;
		$: Observable<ReceiptEmailDoc[]>;
	};
}

/** Give up after this many attempts; the row becomes `failed` and stops. */
export const MAX_SEND_ATTEMPTS = 6;
/** First retry lands 30s after the failure, doubling from there. */
export const BASE_BACKOFF_MS = 30_000;
/** Ceiling, so a till left offline overnight retries every 15 minutes, not every 9 hours. */
export const MAX_BACKOFF_MS = 15 * 60_000;
/** Spacing between two sends in one pass — a struggling server is not helped by a burst. */
export const SEND_SPACING_MS = 1_000;
/** Safety rail on the re-run loop; a drain must always terminate. */
const MAX_PASSES = 5;

export function backoffMs(attempts: number): number {
	const exponent = Math.max(0, attempts - 1);
	// 2 ** 30 overflows nothing here, but the cap is applied before the shift
	// matters anyway.
	return Math.min(BASE_BACKOFF_MS * 2 ** Math.min(exponent, 20), MAX_BACKOFF_MS);
}

const iso = (ms: number) => new Date(ms).toISOString();

export interface EnqueueReceiptEmailInput {
	orderId: number;
	orderNumber?: string;
	email: string;
	saveTo?: string;
	failure?: EmailSendFailure;
}

export interface EnqueueDeps {
	collection: ReceiptEmailQueuePort;
	logger?: DrainLogger;
	now?: () => number;
	uuid?: () => string;
}

/**
 * Row ids are local and never leave the device, so this deliberately does not
 * pull in the `uuid` package: that package is ESM-only and would drag a bundler
 * exception into a module whose whole value is being plain and testable.
 * `crypto.randomUUID` where the platform has it, timestamp + entropy otherwise.
 */
const defaultUuid = (): string => {
	const cryptoRef = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
	if (typeof cryptoRef?.randomUUID === 'function') return cryptoRef.randomUUID();
	return `rem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
};

export interface EnqueueResult {
	/** The row that now represents this send — freshly inserted or the duplicate it joined. */
	localID: string;
	/** True when an identical pending row already existed, so nothing was inserted. */
	deduplicated: boolean;
}

/**
 * Write the send down so it survives an app restart.
 *
 * Double-taps are folded into the existing row rather than queued twice: an
 * offline cashier pressing Send again is asking "did that work?", not asking
 * for a second copy of the receipt.
 */
export function enqueueReceiptEmail(
	deps: EnqueueDeps,
	input: EnqueueReceiptEmailInput
): Promise<EnqueueResult> {
	// Serialized per collection: the duplicate check is a read followed by a
	// write, and two taps landing inside that window would both see an empty
	// queue and insert their own row — two emails for one tap.
	return serializeEnqueue(deps.collection, () => enqueueOnce(deps, input));
}

/** One in-flight enqueue per collection; later callers queue behind it. */
const enqueueChains = new Map<ReceiptEmailQueuePort, Promise<unknown>>();

function serializeEnqueue<T>(
	collection: ReceiptEmailQueuePort,
	task: () => Promise<T>
): Promise<T> {
	const previous = enqueueChains.get(collection) ?? Promise.resolve();
	const result = previous.then(task, task);
	// The chain must survive a failed task, or one rejection would wedge every
	// later enqueue behind it.
	const chained = result.then(
		() => undefined,
		() => undefined
	);
	enqueueChains.set(collection, chained);
	void chained.then(() => {
		if (enqueueChains.get(collection) === chained) enqueueChains.delete(collection);
	});
	return result;
}

async function enqueueOnce(
	deps: EnqueueDeps,
	input: EnqueueReceiptEmailInput
): Promise<EnqueueResult> {
	const now = deps.now ?? Date.now;
	const uuid = deps.uuid ?? defaultUuid;
	const saveTo = input.saveTo ?? '';

	const pending = await deps.collection.find({ selector: { status: { $eq: 'pending' } } }).exec();
	const duplicate = pending.find(
		(row) => row.orderId === input.orderId && row.email === input.email
	);
	if (duplicate) {
		// The repeat tap may ask for something the first did not: saving the
		// address to billing is additive, so adopt it rather than drop it.
		if (saveTo && duplicate.saveTo !== saveTo) {
			await duplicate.incrementalPatch({ saveTo });
		}
		deps.logger?.info('Receipt email already queued', {
			context: {
				type: 'email.queue.queued',
				localID: duplicate.localID,
				orderId: input.orderId,
				deduplicated: true,
			},
		});
		return { localID: duplicate.localID, deduplicated: true };
	}

	const queuedAt = now();
	const attempts = input.failure?.attempted ? 1 : 0;
	const row: ReceiptEmailRow = {
		localID: uuid(),
		orderId: input.orderId,
		email: input.email,
		saveTo,
		status: 'pending',
		queuedAt: iso(queuedAt),
		attempts,
		...(input.orderNumber ? { orderNumber: input.orderNumber } : {}),
		...(input.failure?.attempted
			? {
					lastAttemptAt: iso(queuedAt),
					nextAttemptAt: iso(queuedAt + backoffMs(attempts)),
					lastError: input.failure.reason,
					lastErrorCode: input.failure.code ?? '',
				}
			: {}),
	};
	await deps.collection.insert(row);
	deps.logger?.info('Receipt email queued for sending', {
		context: {
			type: 'email.queue.queued',
			localID: row.localID,
			orderId: row.orderId,
			deduplicated: false,
		},
	});
	return { localID: row.localID, deduplicated: false };
}

export interface ReceiptEmailPostResponse {
	data?: { success?: boolean; message?: string } | null;
}

/** The receipt-email endpoint contract shared by every queue drain trigger. */
export function receiptEmailPostRequest(
	row: Pick<ReceiptEmailRow, 'orderId' | 'email' | 'saveTo'>
): [string, { email: string; save_to: string }] {
	return [`/orders/${row.orderId}/email`, { email: row.email, save_to: row.saveTo ?? '' }];
}

export interface DrainLogger {
	debug: (message: string, options?: { context?: unknown }) => void;
	info: (message: string, options?: { context?: unknown }) => void;
	warn: (message: string, options?: { context?: unknown }) => void;
	error: (message: string, options?: { context?: unknown }) => void;
}

export interface DrainDeps {
	collection: ReceiptEmailQueuePort;
	/** Performs the actual `POST /orders/{id}/email`. */
	post: (row: ReceiptEmailRow) => Promise<ReceiptEmailPostResponse>;
	logger: DrainLogger;
	now?: () => number;
	sleep?: (ms: number) => Promise<void>;
	maxAttempts?: number;
	spacingMs?: number;
}

export interface DrainSummary {
	sent: number;
	/** Rows the server permanently refused, or that ran out of attempts. */
	failed: number;
	/** Rows left pending: waiting out a backoff, or behind a transport that is still down. */
	deferred: number;
}

const emptySummary = (): DrainSummary => ({ sent: 0, failed: 0, deferred: 0 });

const addSummary = (a: DrainSummary, b: DrainSummary): DrainSummary => ({
	sent: a.sent + b.sent,
	failed: a.failed + b.failed,
	deferred: a.deferred + b.deferred,
});

/**
 * One drain per collection at a time, keyed on the collection object.
 *
 * Two callers race here in practice: the connectivity-restore trigger and a
 * cashier pressing Retry in Store health. Without this, both would read the
 * same pending row and post it twice. A caller that arrives mid-drain does not
 * queue a second concurrent pass — it flags the running drain to loop once
 * more, so work enqueued after the current pass read its rows is still picked
 * up, and the caller awaits the same promise.
 */
interface DrainLock {
	again: boolean;
	promise: Promise<DrainSummary>;
}

const inFlight = new Map<ReceiptEmailQueuePort, DrainLock>();
const operationChains = new Map<ReceiptEmailQueuePort, Promise<void>>();
const claimedRows = new Map<ReceiptEmailQueuePort, Set<string>>();

function serializeQueueOperation<T>(
	collection: ReceiptEmailQueuePort,
	operation: () => Promise<T>
): Promise<T> {
	const previous = operationChains.get(collection) ?? Promise.resolve();
	const result = previous.then(operation);
	const settled = result.then(
		() => undefined,
		() => undefined
	);
	operationChains.set(collection, settled);
	void settled.then(() => {
		if (operationChains.get(collection) === settled) operationChains.delete(collection);
	});
	return result;
}

function claimRow(collection: ReceiptEmailQueuePort, localID: string): void {
	const rows = claimedRows.get(collection) ?? new Set<string>();
	rows.add(localID);
	claimedRows.set(collection, rows);
}

function releaseRow(collection: ReceiptEmailQueuePort, localID: string): void {
	const rows = claimedRows.get(collection);
	rows?.delete(localID);
	if (rows?.size === 0) claimedRows.delete(collection);
}

/** Test seam: the module-level lock must not leak between test cases. */
export function __resetDrainLocksForTests(): void {
	inFlight.clear();
	operationChains.clear();
	claimedRows.clear();
}

export function drainReceiptEmailQueue(deps: DrainDeps): Promise<DrainSummary> {
	const existing = inFlight.get(deps.collection);
	if (existing) {
		existing.again = true;
		return existing.promise;
	}

	const lock: DrainLock = { again: false, promise: Promise.resolve(emptySummary()) };
	const run = async (): Promise<DrainSummary> => {
		let summary = emptySummary();
		for (let pass = 0; pass < MAX_PASSES; pass += 1) {
			lock.again = false;
			const result = await drainOnce(deps);
			summary = addSummary(summary, result.summary);
			// A pass that ended because the transport is down must NOT loop, however
			// many callers asked for another one: the next pass would skip the row
			// that just failed (it is in backoff) and spend the following row's
			// attempt against the same dead connection, immediately and unspaced.
			if (result.transportDown || !lock.again) break;
		}
		return summary;
	};

	// `run()` executes synchronously up to its first await, so no other caller
	// can observe the map before the entry lands.
	lock.promise = run().finally(() => {
		inFlight.delete(deps.collection);
	});
	inFlight.set(deps.collection, lock);
	return lock.promise;
}

interface DrainPass {
	summary: DrainSummary;
	/** The pass stopped because nothing can reach the server right now. */
	transportDown: boolean;
}

async function drainOnce(deps: DrainDeps): Promise<DrainPass> {
	const now = deps.now ?? Date.now;
	const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
	const maxAttempts = deps.maxAttempts ?? MAX_SEND_ATTEMPTS;
	const spacingMs = deps.spacingMs ?? SEND_SPACING_MS;
	const summary = emptySummary();

	const pending = await deps.collection.find({ selector: { status: { $eq: 'pending' } } }).exec();
	// Oldest first: the cashier queued them in that order and expects them out
	// in that order.
	const rows = [...pending].sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
	if (rows.length === 0) return { summary, transportDown: false };

	let posted = 0;
	for (const [index, snapshot] of rows.entries()) {
		if (snapshot.nextAttemptAt && Date.parse(snapshot.nextAttemptAt) > now()) {
			summary.deferred += 1;
			continue;
		}

		// Space out consecutive sends. A queue that emptied itself in one burst
		// would hit a server that has just come back up with exactly the traffic
		// spike it can least afford.
		if (posted > 0) await sleep(spacingMs);

		claimRow(deps.collection, snapshot.localID);
		let result: DrainRow;
		try {
			result = await serializeQueueOperation(deps.collection, () =>
				drainRow(deps, snapshot, now, maxAttempts)
			);
		} finally {
			releaseRow(deps.collection, snapshot.localID);
		}
		summary.sent += result.sent;
		summary.failed += result.failed;
		summary.deferred += result.deferred;
		if (result.posted) posted += 1;
		if (result.transportDown) {
			// The transport is down. Every remaining row would fail the same way,
			// burn an attempt against its own budget, and add load a struggling
			// server does not need. Stop the pass; the next trigger picks it up.
			summary.deferred += rows.length - index - 1;
			return { summary, transportDown: true };
		}
	}

	return { summary, transportDown: false };
}

interface DrainRow extends DrainSummary {
	posted: boolean;
	transportDown: boolean;
}

async function drainRow(
	deps: DrainDeps,
	snapshot: ReceiptEmailDoc,
	now: () => number,
	maxAttempts: number
): Promise<DrainRow> {
	const result: DrainRow = { ...emptySummary(), posted: false, transportDown: false };
	// Discard uses this same critical section. Re-read after entering it so the
	// query and POST cannot be split by a successful removal.
	const [doc] = await deps.collection
		.find({
			selector: {
				localID: { $eq: snapshot.localID },
				status: { $eq: 'pending' },
			},
		})
		.exec();
	if (!doc) return result;
	if (doc.nextAttemptAt && Date.parse(doc.nextAttemptAt) > now()) {
		result.deferred = 1;
		return result;
	}

	result.posted = true;
	const attempt = doc.attempts + 1;
	const attemptedAt = iso(now());
	let failure: EmailSendFailure | undefined;
	try {
		const response = await deps.post(doc);
		if (response?.data?.success !== true) {
			throw asPermanent(response?.data?.message ?? 'The server did not send the email.');
		}
	} catch (error) {
		failure = permanentOf(error) ?? classifyEmailSendError(error);
	}

	if (!failure) {
		await patch(deps, doc, {
			status: 'sent',
			attempts: attempt,
			lastAttemptAt: attemptedAt,
			sentAt: attemptedAt,
			lastError: '',
			lastErrorCode: '',
		});
		result.sent = 1;
		deps.logger.info('Queued receipt email sent', {
			context: {
				type: 'email.queue.sent',
				localID: doc.localID,
				orderId: doc.orderId,
				attempts: attempt,
			},
		});
		await forget(deps, doc);
		return result;
	}

	const attemptsAfter = failure.attempted ? attempt : doc.attempts;
	const exhausted =
		failure.kind === 'connectivity' && failure.attempted && attemptsAfter >= maxAttempts;
	if (failure.kind === 'permanent' || exhausted) {
		await patch(deps, doc, {
			status: 'failed',
			attempts: attemptsAfter,
			lastAttemptAt: attemptedAt,
			lastError: exhausted
				? `${failure.reason} (gave up after ${attemptsAfter} tries)`
				: failure.reason,
			lastErrorCode: failure.code ?? '',
		});
		result.failed = 1;
		deps.logger.error('Queued receipt email failed permanently', {
			context: {
				type: 'email.queue.failed',
				localID: doc.localID,
				orderId: doc.orderId,
				attempts: attemptsAfter,
				status: failure.status,
				errorCode: failure.code,
				error: failure.reason,
				exhausted,
			},
		});
		return result;
	}

	await patch(deps, doc, {
		attempts: attemptsAfter,
		lastAttemptAt: attemptedAt,
		nextAttemptAt: iso(now() + backoffMs(Math.max(1, attemptsAfter))),
		lastError: failure.reason,
		lastErrorCode: failure.code ?? '',
	});
	result.deferred = 1;
	result.transportDown = true;
	deps.logger.warn('Queued receipt email deferred', {
		context: {
			type: 'email.queue.deferred',
			localID: doc.localID,
			orderId: doc.orderId,
			attempts: attemptsAfter,
			backoffMs: backoffMs(Math.max(1, attemptsAfter)),
			error: failure.reason,
		},
	});
	return result;
}

/** RxDB caps these fields; a server that answers with an essay must not wedge the row. */
const MAX_ERROR_LENGTH = 500;
const MAX_ERROR_CODE_LENGTH = 64;

const clip = (value: string | undefined, max: number): string | undefined =>
	value === undefined ? undefined : value.length > max ? `${value.slice(0, max - 1)}\u2026` : value;

/**
 * Write a row's new state, tolerating the two ways the write can legitimately
 * fail.
 *
 * Error text comes from the server and is written into length-capped columns, so
 * it is clipped first — an oversized message would otherwise fail schema
 * validation, leave the row `pending` with no backoff, and hand the 60-second
 * tick a row it re-posts forever. And a row the merchant removed mid-send has
 * nothing left to patch; that is an expected outcome, not an error worth
 * aborting the whole drain over.
 */
async function patch(
	deps: DrainDeps,
	doc: ReceiptEmailDoc,
	changes: Partial<ReceiptEmailRow>
): Promise<void> {
	const safe: Partial<ReceiptEmailRow> = {
		...changes,
		...(changes.lastError !== undefined
			? { lastError: clip(changes.lastError, MAX_ERROR_LENGTH) }
			: {}),
		...(changes.lastErrorCode !== undefined
			? { lastErrorCode: clip(changes.lastErrorCode, MAX_ERROR_CODE_LENGTH) }
			: {}),
	};
	try {
		await doc.incrementalPatch(safe);
	} catch (error) {
		if (!latest(doc).deleted) throw error;
		deps.logger.warn('Could not record a receipt email outcome', {
			context: {
				localID: doc.localID,
				orderId: doc.orderId,
				error: error instanceof Error ? error.message : String(error),
			},
		});
	}
}

/** Drop a delivered row; a failure here is only unreclaimed space. */
async function forget(deps: DrainDeps, doc: ReceiptEmailDoc): Promise<void> {
	try {
		await doc.remove();
	} catch (error) {
		deps.logger.debug('Could not prune a sent receipt email', {
			context: {
				localID: doc.localID,
				error: error instanceof Error ? error.message : String(error),
			},
		});
	}
}

/** Marker for a 200-but-declined response, which must not be re-classified as transport. */
const PERMANENT = Symbol('receipt-email-permanent');

function asPermanent(reason: string): Error & { [PERMANENT]: EmailSendFailure } {
	const error = new Error(reason) as Error & { [PERMANENT]: EmailSendFailure };
	error[PERMANENT] = { kind: 'permanent', reason, attempted: true };
	return error;
}

function permanentOf(error: unknown): EmailSendFailure | undefined {
	return (error as { [PERMANENT]?: EmailSendFailure } | null)?.[PERMANENT];
}

/**
 * Put a `failed` row back in the pending lane so the next drain retries it.
 * Attempts are reset because the merchant has made a deliberate decision to try
 * again — usually after fixing whatever the server complained about.
 *
 * Refuses anything that is not currently `failed`, and re-reads the document
 * before deciding. A stale click on a row the drain has since delivered would
 * otherwise resurrect a `sent` row into `pending` and send the receipt twice —
 * the drain lock cannot see this write, because it does not go through it.
 * Returns whether the row was actually requeued.
 */
export async function retryReceiptEmail(
	doc: ReceiptEmailDoc,
	logger?: DrainLogger
): Promise<boolean> {
	const current = latest(doc);
	if (current.status !== 'failed') {
		logger?.debug('Skipped a receipt email retry — the row is no longer failed', {
			context: { localID: doc.localID, status: current.status },
		});
		return false;
	}
	await current.incrementalPatch({
		status: 'pending',
		attempts: 0,
		nextAttemptAt: '',
		lastError: '',
		lastErrorCode: '',
	});
	logger?.info('Queued receipt email retried by hand', {
		context: { type: 'email.queue.retry', localID: doc.localID, orderId: doc.orderId },
	});
	return true;
}

/** The freshest revision RxDB has, or the document itself outside RxDB. */
function latest(doc: ReceiptEmailDoc): ReceiptEmailDoc {
	const withLatest = doc as ReceiptEmailDoc & { getLatest?: () => ReceiptEmailDoc };
	return typeof withLatest.getLatest === 'function' ? withLatest.getLatest() : doc;
}

/** Drop a row the merchant no longer wants sent. */
export async function removeReceiptEmail(
	collection: ReceiptEmailQueuePort,
	doc: ReceiptEmailDoc,
	logger?: DrainLogger
): Promise<boolean> {
	if (claimedRows.get(collection)?.has(doc.localID)) {
		logger?.debug('Skipped a receipt email discard — delivery has already started', {
			context: { localID: doc.localID },
		});
		return false;
	}

	return serializeQueueOperation(collection, async () => {
		const current = latest(doc);
		if (current.deleted || current.status === 'sent') return false;
		await current.remove();
		logger?.info('Queued receipt email discarded', {
			context: {
				type: 'email.queue.discarded',
				localID: current.localID,
				orderId: current.orderId,
				status: current.status,
			},
		});
		return true;
	});
}
