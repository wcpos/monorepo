import { RECORD_UUID_META_KEY } from '@woo-rxdb-lab/shared';

/**
 * A reusable in-memory push server honoring the generic write contract
 * (`{base}/wc-rxdb-sync/v1/push/{collection}`), so the write path is provable end to end
 * WITHOUT a live push — the lab's read-only-server constraint (wcpos.local / dev-free are
 * never written). It lives in the `@woo-rxdb-lab/sync-core/testing` sub-path (NOT the engine
 * index) so it never ships in a production bundle.
 *
 * It models the real Write_Controller (P1-0) FAITHFULLY, so a test can't pass a flow the server
 * would reject:
 *  - the request URL is validated (`{base}/wc-rxdb-sync/v1/push/{collection}`, namespace exactly
 *    once, path collection === envelope collection) — a doubled/misrouted base is a 400, which is
 *    what makes the namespace-mismatch guard real.
 *  - create → assigns a numeric id to a NEW record uuid (201); a create of an already-known uuid is
 *    idempotent (returns the existing id/revision).
 *  - update → REQUIRES the record to exist (404 otherwise) and the supplied `baseRevision` to match
 *    the stored revision (409 conflict otherwise); on success it advances the revision.
 *  - delete → same existence + precondition rules; on success the record is removed.
 *  - identity is REUSED, never re-keyed: the client uuid is echoed back as the uuid meta so
 *    `reconcileCreateAck` passes.
 *  - IDEMPOTENT replay: a `mutationId` that already succeeded returns the SAME response and mutates
 *    nothing — modelling the server's `mutationId` dedupe, so a re-drain is safe. (404/409/400 are
 *    NOT memoised, so a retry after the record is seeded / the conflict resolved can still land.)
 *  - `seed()` pre-establishes an existing server record so update/delete flows can be exercised.
 *  - scriptable faults override the above: 409 conflict, transient 409 `in_progress` / `record_locked`,
 *    428 `precondition_required`, and the PERMANENT 409 `identity_ambiguous` (F4a fail-closed: the
 *    uuid resolves to more than one server record — a duplicated `_woocommerce_pos_uuid` needs the
 *    backfill collision repair, so no retry can ever succeed).
 *  - the ADR 0011 header MIRROR is cross-checked like `Header_Mirror::assert()`: a present
 *    `Idempotency-Key` / `If-Match` header that disagrees with its canonical body field is a 422,
 *    so a mirrored-header regression in the client fails HERE instead of first against a real server.
 */

export type PushEnvelope = {
  mutationId: string;
  operation: 'create' | 'update' | 'delete';
  collection: string;
  recordId: string;
  baseRevision: string | null;
  payload?: Record<string, unknown>;
};

/** A scripted non-success outcome for a matching envelope (returned by the script predicate). */
export type FakeWriteServerFault =
  | { kind: 'conflict'; current?: Record<string, unknown> | null; currentRevision?: string | null }
  | { kind: 'in_progress' }
  | { kind: 'record_locked' }
  | { kind: 'precondition_required' }
  | { kind: 'identity_ambiguous' };

export type FakeWriteServer = {
  /** The fetcher to hand to `pushRecordMutation` / the drain tick. */
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  /**
   * Script the response for matching envelopes. The predicate runs on every request BEFORE the
   * contract logic; return a fault to force it, or `undefined` to let the normal path run. Faults
   * are not memoised. Call again to replace the predicate.
   */
  script: (predicate: (env: PushEnvelope) => FakeWriteServerFault | undefined) => void;
  /** Pre-establish an existing server record so update/delete flows can be exercised. */
  seed: (recordId: string, state: { id: number; revision: string }) => void;
  /** Every envelope received, in order (for call-count / idempotency assertions). */
  readonly received: PushEnvelope[];
  /** Every request URL received, in order (for endpoint/namespace assertions). */
  readonly receivedUrls: string[];
  /** Durable server state: `recordId` (uuid) → its assigned numeric id + current revision. */
  readonly applied: ReadonlyMap<string, { id: number; revision: string }>;
};

export type FakeWriteServerOptions = {
  /** First numeric id assigned to a create; increments per distinct `recordId`. Default 500. */
  firstId?: number;
};

const NAMESPACE = '/wc-rxdb-sync/v1/';
const PUSH_MARKER = '/wc-rxdb-sync/v1/push/';

/** Parse + validate a push URL: the namespace must appear exactly once and the path must end in a
 * single `push/{collection}` segment. Returns the decoded collection, or null for a bad route. */
function parsePushUrl(url: string): { collection: string } | null {
  const firstNs = url.indexOf(NAMESPACE);
  // Doubled-namespace guard: `{base already ending in /wc-rxdb-sync/v1}` + resolver's own suffix.
  if (firstNs === -1 || url.indexOf(NAMESPACE, firstNs + 1) !== -1) return null;
  const idx = url.indexOf(PUSH_MARKER);
  if (idx === -1) return null;
  const tail = url.slice(idx + PUSH_MARKER.length);
  if (tail === '' || tail.includes('/')) return null; // must be exactly one collection segment
  return { collection: decodeURIComponent(tail) };
}

/** Case-insensitive header lookup across the `HeadersInit` shapes; empty/whitespace → absent (null). */
function headerValue(init: RequestInit | undefined, name: string): string | null {
  const headers = init?.headers;
  if (!headers) return null;
  let raw: string | null | undefined;
  if (typeof (headers as Headers).get === 'function') {
    raw = (headers as Headers).get(name);
  } else if (Array.isArray(headers)) {
    raw = headers.find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
  } else {
    const record = headers as Record<string, string>;
    const key = Object.keys(record).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
    raw = key === undefined ? undefined : record[key];
  }
  if (raw === undefined || raw === null) return null;
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

/** Strip an optional weak indicator (W/) and surrounding double quotes from an entity-tag, so the bare
 * revision compares equal even if an intermediary weakened a strong tag (RFC 9110 §8.8.3) — the same
 * normalization as `Header_Mirror::unquote_entity_tag()`. */
function unquoteEntityTag(value: string | null): string | null {
  if (value === null) return null;
  let tag = value.startsWith('W/') ? value.slice(2) : value;
  if (tag.length >= 2 && tag.startsWith('"') && tag.endsWith('"')) {
    tag = tag.slice(1, -1);
  }
  return tag;
}

export function createFakeWriteServer(options: FakeWriteServerOptions = {}): FakeWriteServer {
  let nextId = options.firstId ?? 500;
  const records = new Map<string, { id: number; revision: string }>();
  const writesByRecord = new Map<string, number>();
  const received: PushEnvelope[] = [];
  const receivedUrls: string[] = [];
  // mutationId → the response already produced for a SUCCESS, so a replay is byte-identical (idempotent).
  const memoByMutation = new Map<string, { status: number; body: unknown }>();
  let scriptFn: (env: PushEnvelope) => FakeWriteServerFault | undefined = () => undefined;

  const asResponse = (status: number, body: unknown): Response =>
    ({ status, ok: status >= 200 && status < 300, json: async () => body }) as unknown as Response;

  const advanceRevision = (recordId: string): string => {
    const writes = (writesByRecord.get(recordId) ?? 0) + 1;
    writesByRecord.set(recordId, writes);
    return `sha256:${recordId.slice(0, 8)}-r${writes}`;
  };

  const successBody = (id: number, recordId: string, revision: string) => ({
    document: { id, meta_data: [{ key: RECORD_UUID_META_KEY, value: recordId }] },
    currentRevision: revision,
  });

  const faultBody = (fault: FakeWriteServerFault, env: PushEnvelope): { status: number; body: unknown } => {
    switch (fault.kind) {
      case 'conflict':
        return { status: 409, body: { code: 'woo_rxdb_sync_conflict', message: 'baseRevision is stale.', current: fault.current ?? null, currentRevision: fault.currentRevision ?? null } };
      case 'in_progress':
        return { status: 409, body: { code: 'woo_rxdb_sync_in_progress' } };
      case 'record_locked':
        return { status: 409, body: { code: 'woo_rxdb_sync_record_locked' } };
      case 'precondition_required':
        return { status: 428, body: { code: 'woo_rxdb_sync_precondition_required' } };
      case 'identity_ambiguous':
        // F4a: `resolve_id_by_uuid` fails CLOSED when the uuid is on >1 record. Unlike the
        // controller's conflict envelope, the real response is a bare `WP_Error` propagated to
        // WP's REST serializer, so the body is the standard WP error shape — `{ code, message,
        // data: { status } }` (class-mutation-store.php `unique_id_or_ambiguous`), NOT
        // `{ code, current, currentRevision }`. No `current` state exists to resolve against.
        return {
          status: 409,
          body: {
            code: 'woo_rxdb_sync_identity_ambiguous',
            message: `uuid ${env.recordId} resolves to more than one record; refusing to write to an arbitrary match.`,
            data: { status: 409 },
          },
        };
    }
  };

  const conflict = (existing: { id: number; revision: string }): { status: number; body: unknown } => ({
    status: 409,
    body: { code: 'woo_rxdb_sync_conflict', message: 'baseRevision is stale.', current: { id: existing.id }, currentRevision: existing.revision },
  });

  return {
    received,
    receivedUrls,
    applied: records,
    script: (predicate) => {
      scriptFn = predicate;
    },
    seed: (recordId, state) => {
      records.set(recordId, state);
      if (state.id >= nextId) nextId = state.id + 1;
    },
    fetch: async (url: string, init?: RequestInit) => {
      const env = JSON.parse((init?.body as string) ?? '{}') as PushEnvelope;
      received.push(env);
      receivedUrls.push(url);

      // ADR 0011 header-mirror cross-check, faithful to `Header_Mirror::assert()`: the body is
      // canonical; a PRESENT mirror header that disagrees with its body field is rejected (422)
      // rather than trusting either side. Runs before the idempotency memo, like the real server.
      const headerMutationId = headerValue(init, 'idempotency-key');
      if (headerMutationId !== null && headerMutationId !== env.mutationId) {
        return asResponse(422, { code: 'woo_rxdb_sync_header_body_mismatch', message: 'Idempotency-Key header disagrees with body mutationId.' });
      }
      const headerBaseRevision = unquoteEntityTag(headerValue(init, 'if-match'));
      const bodyBaseRevision = typeof env.baseRevision === 'string' ? env.baseRevision : '';
      if (headerBaseRevision !== null && headerBaseRevision !== bodyBaseRevision) {
        return asResponse(422, { code: 'woo_rxdb_sync_header_body_mismatch', message: 'If-Match header disagrees with body baseRevision.' });
      }

      // Replay the exact original verdict: applied creates remain 201, while
      // born-twice creates remain 200 so the client re-lands their payload.
      const memo = memoByMutation.get(env.mutationId);
      if (memo) return asResponse(memo.status, memo.body);

      // Validate the route — a doubled/misrouted base or a mismatched collection is a hard 400. This
      // is what makes the namespace-mismatch guard real (the URL is checked, not just the body).
      const route = parsePushUrl(url);
      if (!route || route.collection !== env.collection) {
        return asResponse(400, { code: 'woo_rxdb_sync_bad_route', url, collection: env.collection });
      }

      // Scripted fault override (not memoised — a later retry can still succeed).
      const fault = scriptFn(env);
      if (fault) {
        const { status, body } = faultBody(fault, env);
        return asResponse(status, body);
      }

      const existing = records.get(env.recordId);
      const remember = (status: number, body: unknown): Response => {
        memoByMutation.set(env.mutationId, { status, body });
        return asResponse(status, body);
      };

      if (env.operation === 'delete') {
        if (!existing) return asResponse(404, { code: 'woo_rxdb_sync_not_found' });
        if (env.baseRevision !== existing.revision) {
          const c = conflict(existing);
          return asResponse(c.status, c.body);
        }
        records.delete(env.recordId);
        return remember(200, {});
      }

      if (env.operation === 'update') {
        if (!existing) return asResponse(404, { code: 'woo_rxdb_sync_not_found' });
        if (env.baseRevision !== existing.revision) {
          const c = conflict(existing);
          return asResponse(c.status, c.body);
        }
        const revision = advanceRevision(env.recordId);
        records.set(env.recordId, { id: existing.id, revision });
        return remember(200, successBody(existing.id, env.recordId, revision));
      }

      // create
      if (existing) {
        // A create for a uuid the server already knows is idempotent (the real server dedupes on the
        // uuid / mutationId) — return the existing id/revision rather than allocating a second.
        return remember(200, successBody(existing.id, env.recordId, existing.revision));
      }
      const id = nextId++;
      const revision = advanceRevision(env.recordId);
      records.set(env.recordId, { id, revision });
      return remember(201, successBody(id, env.recordId, revision));
    },
  };
}
