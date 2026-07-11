import {
	checkpointInstantMs,
	normalizeCheckpoint,
	type OrderDocument,
	type PullResponse,
	type ServerMetrics,
	type SyncCheckpoint,
} from './protocol';

type Fetcher = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

/** UTF-8 byte size of a response body — the transfer-size metric every pull
 * adapter reports (also used by the web lab's skeleton/sparse adapters). */
export function measuredResponseBytes(body: string): number {
	return new TextEncoder().encode(body).byteLength;
}

export async function pullCustomBatch(input: {
	baseUrl: string;
	checkpoint: Partial<SyncCheckpoint> | null;
	limit: number;
	benchmarkProfile?: string;
	/** Opt into the server delete channel (F6): the response carries `deletes: wooOrderId[]`. */
	includeDeletes?: boolean;
	/**
	 * The transport port — REQUIRED, never defaulted to the global `fetch`. A silent
	 * global fallback hides the host's transport dependency and binds web semantics
	 * into the engine (React Native / worker hosts must inject their own).
	 */
	fetcher: Fetcher;
	signal?: AbortSignal;
}): Promise<PullResponse & { metrics?: ServerMetrics; responseBytes: number }> {
	const checkpoint = normalizeCheckpoint(input.checkpoint);
	const params = new URLSearchParams({
		limit: String(input.limit),
		updated_at_gmt: checkpoint.updatedAtGmt,
		order_id: String(checkpoint.orderId),
		sequence: String(checkpoint.sequence),
	});
	if (input.benchmarkProfile && input.benchmarkProfile !== 'good-local') {
		params.set('benchmark_profile', input.benchmarkProfile);
	}
	if (input.includeDeletes) {
		params.set('include_deletes', 'true');
	}
	const url = `${input.baseUrl}/orders/pull?${params.toString()}`;
	const response = input.signal
		? await input.fetcher(url, { signal: input.signal })
		: await input.fetcher(url);
	if (!response.ok) {
		throw new Error(`Custom pull failed: ${response.status}`);
	}
	const body = await response.text();
	const parsed = JSON.parse(body) as PullResponse & { metrics?: ServerMetrics };
	return { ...parsed, responseBytes: measuredResponseBytes(body) };
}

export type CustomPullRepository = {
	upsertMany(documents: PullResponse['documents']): Promise<void>;
	/**
	 * Remove the local orders for a server delete batch (F6). Optional — collections without a
	 * tombstone channel omit it and the adapter no-ops. The wooOrderIds are resolved to stored uuid
	 * keys and removed, EXCEPT any order with queued local work (pending mutation / dirty), which the
	 * implementation keeps resident so an offline POS edit is never clobbered by an upstream delete.
	 * The pending set is the same one used to guard upserts.
	 */
	removeDeletedOrders?(
		wooOrderIds: number[],
		pendingMutationOrderIds?: ReadonlySet<string | number>
	): Promise<void>;
	/**
	 * Reconcile the local collection for a journal reset (F8). When the sequence generation changed,
	 * the re-pull from zero only upserts the CURRENT generation + applies its tombstones — a local
	 * order absent from the new generation (deleted in the old one, restore to an older backup, etc.)
	 * would otherwise linger as a phantom. Clear every local row EXCEPT those with queued local work
	 * (pending mutation / dirty), which stay resident so an offline POS edit survives the resync.
	 * Optional — collections without a resync story omit it and the adapter no-ops.
	 */
	resetForResync?(pendingMutationOrderIds?: ReadonlySet<string | number>): Promise<void>;
};

export type CustomPullCheckpointStore = {
	readCustomPullCheckpoint(): Promise<SyncCheckpoint>;
	writeCustomPullCheckpoint(checkpoint: SyncCheckpoint): Promise<void>;
	/** The journal epoch stored beside the checkpoint (F8), or undefined if never seen. Optional. */
	readJournalEpoch?(): Promise<string | undefined>;
	/** Persist the server's journal epoch beside the checkpoint (F8). Optional. */
	writeJournalEpoch?(epoch: string): Promise<void>;
};

export type CustomPullSyncProgress = {
	batch: number;
	documentCount: number;
	totalDocuments: number;
};

const MAX_STALLED_BATCHES = 3;

/**
 * A pull envelope that violates the journal contract in a way no faithful server can produce —
 * the ADR 0017 poison family (sibling of the web host's ChangeSignalPoisonError). Thrown BEFORE
 * the batch is applied, so a hostile/broken envelope can never move the cursor or reach the
 * repository; the checkpoint stays exactly where it was for the next pull to retry. Distinct from
 * the F8 resync triggers, which are LEGITIMATE generation changes (epoch mismatch / request cursor
 * past head) detected before these guards run.
 */
export class CustomPullPoisonError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CustomPullPoisonError';
	}
}

export type CustomPullBatchSyncResult = {
	documents: number;
	hasMore: boolean;
	checkpoint: SyncCheckpoint;
};

/**
 * Saturday-rush pull guard (docs/wcpos-pain-points.md, conflict-resolution
 * working defaults): a pulled document must never overwrite a record that
 * still has pending local mutations. Pure helper — callers pass the set of
 * order identifiers (document ids, temp ids, or Woo order ids) that currently
 * have queued mutations.
 */
export function shouldApplyPulledDocument(
	pulledDocument: Pick<OrderDocument, 'id' | 'wooOrderId'>,
	pendingMutationOrderIds: ReadonlySet<string | number>
): boolean {
	if (pendingMutationOrderIds.has(pulledDocument.id)) {
		return false;
	}
	const wooOrderId = pulledDocument.wooOrderId;
	return !(typeof wooOrderId === 'number' && pendingMutationOrderIds.has(wooOrderId));
}

export async function syncCustomPullBatchIntoRepository(input: {
	baseUrl: string;
	limit: number;
	repository: CustomPullRepository;
	checkpoint?: Partial<SyncCheckpoint> | null;
	checkpointStore?: CustomPullCheckpointStore;
	/** The transport port — required; see `pullCustomBatch`. */
	fetcher: Fetcher;
	signal?: AbortSignal;
	/** Order identifiers with queued local mutations; matching pulled documents are skipped. */
	pendingMutationOrderIds?: ReadonlySet<string | number>;
	/** Opt into the server delete channel (F6) — the response's `deletes` become local removals. */
	includeDeletes?: boolean;
	/**
	 * Re-read the pending-mutation set immediately BEFORE applying deletes (F6). A delete is
	 * destructive — removing an order the user just started editing loses the local work — so unlike
	 * the upsert filter (which tolerates the pre-pull snapshot), the delete guard must see mutations
	 * queued while the request was in flight. Called once per batch, just before removeDeletedOrders;
	 * falls back to `pendingMutationOrderIds` when absent.
	 */
	refreshPendingMutationOrderIds?: () => Promise<ReadonlySet<string | number>>;
	/**
	 * Client-assembly seam (keeps this adapter collection-agnostic): map each record the
	 * server returned into the stored document. The order fetcher injects identity assembly
	 * here (`identifyRecord` from the payload), so the CLIENT owns the document id rather than
	 * the server building the envelope. Applied before dedup/pending-filter so both see the
	 * assembled id. Omitted → the server's document is stored as-is.
	 */
	assembleDocument?: (
		document: PullResponse['documents'][number]
	) => PullResponse['documents'][number];
	afterUpsert?: (
		documents: PullResponse['documents'],
		result: Pick<PullResponse, 'hasMore' | 'checkpoint'>
	) => Promise<void>;
}): Promise<CustomPullBatchSyncResult> {
	const checkpoint: SyncCheckpoint =
		input.checkpoint === undefined
			? normalizeCheckpoint(await input.checkpointStore?.readCustomPullCheckpoint())
			: normalizeCheckpoint(input.checkpoint);

	const result = await pullCustomBatch({
		baseUrl: input.baseUrl,
		checkpoint,
		limit: input.limit,
		includeDeletes: input.includeDeletes,
		fetcher: input.fetcher,
		signal: input.signal,
	});

	// Re-read the pending-mutation set ONCE, as fresh as possible, for every guard this batch applies
	// — the upsert filter, the delete purge, AND the resync reconcile. A mutation queued while the
	// request was in flight must be protected everywhere: reconcile keeps its order, the upsert must
	// not clobber it, and a delete must not remove it. When no refresh provider is given this is just
	// the pre-pull snapshot (unchanged behavior).
	const effectivePending = input.refreshPendingMutationOrderIds
		? await input.refreshPendingMutationOrderIds()
		: input.pendingMutationOrderIds;

	// F8 journal epoch: detect a reset `sequence` generation BEFORE applying or advancing. Two
	// triggers — (a) the epoch we stored differs from the server's (a new generation: fresh install /
	// cleared option); (b) our cursor sequence exceeds the server's head (the AUTO_INCREMENT space
	// reset beneath us: restore/truncate). Either way this batch was pulled with an invalid cursor, so
	// discard it, reset the checkpoint to zero, adopt the new epoch, and signal a re-pull from scratch.
	const storedEpoch = await input.checkpointStore?.readJournalEpoch?.();
	const epochMismatch = Boolean(storedEpoch && result.epoch && storedEpoch !== result.epoch);
	const cursorPastHead = typeof result.head === 'number' && checkpoint.sequence > result.head;
	if (epochMismatch || cursorPastHead) {
		const zero = normalizeCheckpoint(null);
		// Reconcile the local collection before the re-pull so an order absent from the new generation
		// doesn't linger as a phantom — the fresh pending set keeps a mutation queued mid-pull.
		await input.repository.resetForResync?.(effectivePending);
		await input.checkpointStore?.writeCustomPullCheckpoint(zero);
		if (result.epoch) {
			await input.checkpointStore?.writeJournalEpoch?.(result.epoch);
		}
		return { documents: 0, hasMore: true, checkpoint: zero };
	}

	// Hostile-envelope poison guards (B7, ADR 0017 family). They run AFTER the F8 resync branch, so
	// what reaches them is a same-generation response by construction — an epoch change or a
	// same-epoch head reset (request cursor past head) already resolved into a resync above. Within
	// one generation, `head` is the journal MAX(sequence) and the response checkpoint starts at the
	// request cursor and only advances along emitted rows (`sequence > cursor`), so two shapes are
	// IMPOSSIBLE for a contract-faithful server and must abort the pull unapplied:
	//  - checkpoint.sequence > head: the server claims to have served rows past its own journal head.
	//    Advancing onto it arms the cursorPastHead resync for the NEXT batch, and with `hasMore` true
	//    the resulting resync↔advance ping-pong resets the stall counter on every flip — the B5
	//    infinite pull loop (surfaced as an OOM). Guarded regardless of `hasMore`: with `hasMore`
	//    false the same envelope would silently persist a cursor past head and force a spurious full
	//    resync on the next pull.
	//  - checkpoint.sequence < request cursor, except the legacy PHP modified-date fallback sentinel
	//    `sequence: 0`: any non-zero regression would be read as "advanced" by the stall guard and
	//    re-serve already-applied rows. A zero fallback page is contract-faithful unless documents are
	//    present while the server also reports head <= 0, which is a real reset shape, not fallback.
	const nextCheckpoint = normalizeCheckpoint(result.checkpoint);
	if (typeof result.head === 'number' && nextCheckpoint.sequence > result.head) {
		throw new CustomPullPoisonError(
			`Custom pull poisoned: response checkpoint sequence ${nextCheckpoint.sequence} exceeds the reported journal head ${result.head}`
		);
	}
	const sequenceRegressed = nextCheckpoint.sequence < checkpoint.sequence;
	const fallbackSequenceZero = nextCheckpoint.sequence === 0;
	const resetHeadWithDocuments =
		result.documents.length > 0 && typeof result.head === 'number' && result.head <= 0;
	if (sequenceRegressed && (!fallbackSequenceZero || resetHeadWithDocuments)) {
		throw new CustomPullPoisonError(
			`Custom pull poisoned: response checkpoint sequence ${nextCheckpoint.sequence} regressed below the request cursor sequence ${checkpoint.sequence}`
		);
	}

	const assembled = input.assembleDocument
		? result.documents.map(input.assembleDocument)
		: result.documents;
	const documents = deduplicateDocumentsById(assembled).filter(
		(document) => !effectivePending || shouldApplyPulledDocument(document, effectivePending)
	);
	await input.repository.upsertMany(documents);
	// Apply the delete channel (F6). The repository owns wooOrderId→uuid resolution + the pending/dirty
	// guard (it has the local docs); the server already coalesced each order to its net state, so a
	// wooOrderId here is a settled delete, never also present in `documents`.
	if (result.deletes && result.deletes.length > 0) {
		await input.repository.removeDeletedOrders?.(result.deletes, effectivePending);
	}
	await input.afterUpsert?.(documents, { hasMore: result.hasMore, checkpoint: nextCheckpoint });
	await input.checkpointStore?.writeCustomPullCheckpoint(nextCheckpoint);
	// Adopt the server's epoch (F8) — first-seen on a fresh client, idempotent thereafter — so a later
	// change of generation is detectable as a mismatch against what we stored here.
	if (result.epoch) {
		await input.checkpointStore?.writeJournalEpoch?.(result.epoch);
	}

	return {
		documents: documents.length,
		hasMore: result.hasMore,
		checkpoint: nextCheckpoint,
	};
}

function deduplicateDocumentsById(documents: PullResponse['documents']): PullResponse['documents'] {
	const byId = new Map<string, PullResponse['documents'][number]>();
	for (const document of documents) {
		byId.set(document.id, document);
	}
	return [...byId.values()];
}

export async function syncCustomPullIntoRepository(input: {
	baseUrl: string;
	limit: number;
	repository: CustomPullRepository;
	checkpoint?: Partial<SyncCheckpoint> | null;
	checkpointStore?: CustomPullCheckpointStore;
	/** The transport port — required; see `pullCustomBatch`. */
	fetcher: Fetcher;
	signal?: AbortSignal;
	/** Order identifiers with queued local mutations; matching pulled documents are skipped. */
	pendingMutationOrderIds?: ReadonlySet<string | number>;
	/** Opt into the server delete channel (F6) — forwarded to each batch. */
	includeDeletes?: boolean;
	/**
	 * Re-read pending mutations immediately before the destructive delete apply — forwarded to each
	 * batch. Without this, a wrapper caller enabling includeDeletes would get the stale pre-pull
	 * snapshot for the delete guard, reintroducing the mid-pull-mutation-clobbered risk the batch
	 * helper fixes.
	 */
	refreshPendingMutationOrderIds?: () => Promise<ReadonlySet<string | number>>;
	/** Client-assembly seam — see syncCustomPullBatchIntoRepository. */
	assembleDocument?: (
		document: PullResponse['documents'][number]
	) => PullResponse['documents'][number];
	onBatch?: (progress: CustomPullSyncProgress) => void;
}): Promise<{ batches: number; documents: number }> {
	let checkpoint: SyncCheckpoint =
		input.checkpoint === undefined
			? normalizeCheckpoint(await input.checkpointStore?.readCustomPullCheckpoint())
			: normalizeCheckpoint(input.checkpoint);
	let hasMore = true;
	let batch = 1;
	let totalDocuments = 0;
	let stalledBatches = 0;

	while (hasMore) {
		const previousCheckpoint = checkpoint;
		const result = await syncCustomPullBatchIntoRepository({
			baseUrl: input.baseUrl,
			limit: input.limit,
			repository: input.repository,
			checkpoint,
			checkpointStore: input.checkpointStore,
			fetcher: input.fetcher,
			signal: input.signal,
			pendingMutationOrderIds: input.pendingMutationOrderIds,
			includeDeletes: input.includeDeletes,
			refreshPendingMutationOrderIds: input.refreshPendingMutationOrderIds,
			assembleDocument: input.assembleDocument,
		});

		totalDocuments += result.documents;
		input.onBatch?.({ batch, documentCount: result.documents, totalDocuments });

		const nextCheckpoint = result.checkpoint;
		checkpoint = nextCheckpoint;
		hasMore = result.hasMore;
		// Compare `updatedAtGmt` as an INSTANT, not a raw string: Woo emits the same
		// GMT time in inconsistent forms (bare / `Z` / `+00:00`), and treating two
		// forms of one instant as "advanced" would defeat this stall guard and spin
		// an infinite pull loop (1.9.x bug fa7b51add). orderId/revision/sequence are
		// exact tokens, compared verbatim.
		const checkpointAdvanced =
			checkpointInstantMs(nextCheckpoint.updatedAtGmt) !==
				checkpointInstantMs(previousCheckpoint.updatedAtGmt) ||
			nextCheckpoint.orderId !== previousCheckpoint.orderId ||
			nextCheckpoint.revision !== previousCheckpoint.revision ||
			nextCheckpoint.sequence !== previousCheckpoint.sequence;
		stalledBatches = checkpointAdvanced ? 0 : stalledBatches + 1;
		if (hasMore && stalledBatches >= MAX_STALLED_BATCHES) {
			throw new Error('Custom pull stalled: checkpoint did not advance while hasMore=true');
		}
		batch += 1;
	}

	return { batches: batch - 1, documents: totalDocuments };
}
