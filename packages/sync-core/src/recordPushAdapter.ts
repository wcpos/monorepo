import {
  type MetaDataEntry,
  type SyncEvent,
  type SyncObserver,
  readRecordUuid,
} from '@woo-rxdb-lab/shared';
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

export type PushEndpoint = { url: string; method: string };

/** Routes a mutation to its per-collection endpoint + verb. Injected by the host. */
export type EndpointResolver = (mutation: RecordMutation) => PushEndpoint;

/**
 * The canonical resolver for the lab's generic write surface (PR #224): every
 * mutation POSTs to `{base}/wc-rxdb-sync/v1/push/{collection}`, dispatched server-side
 * on the envelope's operation. `baseUrl` is the wp-json root (trailing slash optional).
 */
export function pushEndpointResolver(baseUrl: string): EndpointResolver {
  // Trim trailing slashes linearly (a `/\/+$/` regex is flagged as ReDoS-prone).
  let base = baseUrl;
  while (base.endsWith('/')) base = base.slice(0, -1);
  return (mutation) => ({ url: `${base}/wc-rxdb-sync/v1/push/${encodeURIComponent(mutation.collectionName)}`, method: 'POST' });
}

export type ServerDocument = Record<string, unknown> & { id?: unknown; meta_data?: MetaDataEntry[] };

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
  public constructor(mutation: RecordMutation, status: number, reason?: string, permanent = false) {
    super(`push ${mutation.operation} ${mutation.collectionName}/${mutation.recordId} failed: ${status}${reason ? ` (${reason})` : ''}`);
    this.name = 'RecordPushError';
    this.mutation = mutation;
    this.status = status;
    this.reason = reason;
    this.permanent = permanent;
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
}): Promise<PushResult> {
  const { mutation } = input;
  const emit = (event: SyncEvent): void => {
    try {
      input.observe?.(event);
    } catch {
      // best-effort: telemetry must never break the push.
    }
  };
  const baseFields = { op: mutation.operation, recordId: mutation.recordId, mutationId: mutation.mutationId };

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
    envelope.payload = mutation.payload;
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
    const aborted = input.signal?.aborted === true || (error instanceof Error && error.name === 'AbortError');
    emit({
      type: aborted ? 'push.aborted' : 'push.error',
      level: aborted ? 'warn' : 'error',
      collection: mutation.collectionName,
      fields: { ...baseFields, reason: error instanceof Error ? error.name : 'unknown' },
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
    if (body?.code === 'woo_rxdb_sync_in_progress' || body?.code === 'woo_rxdb_sync_record_locked') {
      const reason = body.code === 'woo_rxdb_sync_record_locked' ? 'record-locked' : 'in-progress';
      emit({ type: 'push.in_progress', level: 'warn', collection: mutation.collectionName, fields: baseFields });
      throw new RecordPushError(mutation, 409, reason);
    }
    // A PERMANENT 409 — `identity_ambiguous` (F4a): the record's uuid resolves to MORE THAN
    // ONE server record, so the server fails closed rather than write an arbitrary match.
    // This is NOT an optimistic-concurrency conflict (there is no `current` to rebase on)
    // and NOT transient (a duplicated uuid needs the backfill collision repair) — treating
    // it as either would loop the mutation forever. Throw a permanent error so the drain
    // dead-letters it with the failure surfaced.
    if (body?.code === 'woo_rxdb_sync_identity_ambiguous') {
      emit({ type: 'push.error', level: 'error', collection: mutation.collectionName, fields: { ...baseFields, status: 409, reason: 'identity-ambiguous' } });
      throw new RecordPushError(mutation, 409, 'identity-ambiguous', true);
    }
    emit({ type: 'push.conflict', level: 'warn', collection: mutation.collectionName, fields: baseFields });
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
    emit({ type: 'push.error', level: 'warn', collection: mutation.collectionName, fields: { ...baseFields, status: 428, reason: 'precondition-required' } });
    throw new RecordPushError(mutation, 428, typeof body?.code === 'string' ? body.code : 'precondition-required');
  }

  if (!response.ok) {
    emit({ type: 'push.error', level: 'error', collection: mutation.collectionName, fields: { ...baseFields, status: response.status } });
    throw new RecordPushError(mutation, response.status);
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
      document = body === null ? null : (input.extractDocument ? input.extractDocument(body) : (isEnvelope ? (body.document as ServerDocument) : (body as ServerDocument)));
    } catch {
      // A throwing host extractor must not exit a successful HTTP push silently —
      // instrument it like any other unusable ack, then fail fast.
      emit({ type: 'push.error', level: 'error', collection: mutation.collectionName, fields: { ...baseFields, status: response.status, reason: 'extract-failed' } });
      throw new RecordPushError(mutation, response.status, 'extract-failed');
    }
    // A create/update that 2xx'd but returned no parseable record can't be
    // reconciled (no server id, no uuid to verify) — fail fast so the drain leaves
    // it queued to retry rather than acknowledging a write it can't follow up.
    if (document === null) {
      emit({ type: 'push.error', level: 'error', collection: mutation.collectionName, fields: { ...baseFields, status: response.status, reason: 'no-document' } });
      throw new RecordPushError(mutation, response.status, 'no-document');
    }
    currentRevision = isEnvelope && body && typeof body.currentRevision === 'string' ? (body.currentRevision as string) : null;
  }
  emit({ type: 'push.outcome', level: 'info', collection: mutation.collectionName, fields: { ...baseFields, outcome } });
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
 * Resolve a create ack (`awaitingRemoteCreateUUID`): the server reuses the
 * client-minted `_woocommerce_pos_uuid` (#219), so the record is NEVER re-keyed.
 * Returns the stable `recordId` (unchanged) and the server-assigned `remoteId` to
 * store as a field on the uuid-keyed record. Throws if the server came back with a
 * DIFFERENT uuid — that is a broken identity contract, not a reconciliation.
 */
export function reconcileCreateAck(
  mutation: RecordMutation,
  document: ServerDocument | null,
): { recordId: string; remoteId: unknown } {
  const serverUuid = readRecordUuid(document?.meta_data ?? null);
  if (serverUuid && serverUuid !== mutation.recordId) {
    throw new Error(
      `reconcileCreateAck: server returned uuid "${serverUuid}" for a create keyed "${mutation.recordId}" — identity must never be re-keyed.`,
    );
  }
  return { recordId: mutation.recordId, remoteId: document?.id ?? null };
}
