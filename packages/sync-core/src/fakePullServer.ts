import { RECORD_UUID_META_KEY, type OrderDocument, type SyncCheckpoint } from '@woo-rxdb-lab/shared';

/**
 * A reusable in-memory PULL server honoring the custom-pull contract
 * (`{base}/wc-rxdb-sync/v1/orders/pull`), the read-side sibling of `fakeWriteServer`. It lives in
 * the `@woo-rxdb-lab/sync-core/testing` sub-path (NOT the engine index) so it never ships in a
 * production bundle.
 *
 * It models the real `pull_orders` (class-rest-controller.php:84-238) FAITHFULLY, so
 * pull/checkpoint tests consume the envelope the PHP actually emits instead of re-guessing it
 * inline per test:
 *  - an append-only sync-index journal: rows are served `sequence > cursor ORDER BY sequence ASC
 *    LIMIT limit+1` (class-sync-index.php:285-292) — sequence is the sole cursor in the indexed
 *    path, and `hasMore` is the limit+1 probe (class-rest-controller.php:106-109).
 *  - the response checkpoint starts at the REQUEST cursor and only advances per row actually
 *    emitted or permanently skipped (:116-125, :207) — `{updatedAtGmt, orderId, revision,
 *    sequence}` in exactly that key order.
 *  - per-page coalescing to each order's LATEST row (:139-148): an update superseded by a later
 *    delete in the same page surfaces only as the tombstone, and vice versa.
 *  - the F6 delete channel: a deleted row reaches `deletes` (wooOrderIds) only when the client
 *    opted in via `include_deletes` (strict boolean, :97/:155-161); the checkpoint always
 *    advances past it.
 *  - F8 journal epoch + head siblings of the checkpoint (:210-224); `resetJournal` models a new
 *    sequence generation (fresh install / restore) for resync tests.
 *  - sparse fieldsets (`order_fields`, :173-175 + :244-257): requested fields are kept, and the
 *    `_woocommerce_pos_uuid` identity meta ALWAYS survives the filter
 *    (RestControllerTest.php:345-367) — documents flip to `partial: true`.
 *  - documents are keyed by the order's stable uuid read from payload meta (:190-206), never a
 *    synthetic id, and that meta must be a REAL uuid — `read_valid_uuid_from_meta` skips anything
 *    that fails the 8-4-4-4-12 shape (class-pos-uuid.php:25-48), so `seed()` rejects it too;
 *    `sync.source` is `'custom-pull'`, `local` is the clean-server shape.
 *  - the controller's compression headers on every 200 (compression_headers_for_mode, :465-474):
 *    the Vary/mode/expose triple always, plus `Content-Encoding: identity` +
 *    `Cache-Control: no-transform` for an identity pull.
 *  - a deterministic `metrics` snapshot matching Woo_RxDB_Sync_Metrics::snapshot
 *    (class-metrics.php:35-47 + the extras at class-rest-controller.php:226-231).
 *  - scriptable faults in the fakeWriteServer style — including `html_page`, the WP
 *    maintenance/error page poison (ADR 0017 P2L-3d): a 200 text/html body that must make the
 *    client THROW (JSON parse failure) rather than advance its cursor.
 *
 * NOTE (B5 finding → closed by B7): the pull adapter rejects non-zero cursor REGRESSIONS and
 * checkpoint-past-head envelopes as poison (`CustomPullPoisonError`, customPullAdapter.ts). Those
 * shapes are contract-IMPOSSIBLE in the indexed path — head is the journal MAX(sequence) and the
 * response checkpoint only advances from the request cursor — so this fake deliberately provides no
 * fault for them; their tests hand-roll hostile envelopes (customPullAdapter.test.ts, poison-guard
 * describe). The legacy PHP modified-date fallback can still emit `sequence: 0`, so the adapter
 * permits that sentinel separately.
 */

/** The request as `pull_orders` sanitizes it (class-rest-controller.php:91-98, 244-257, 478-492). */
export type FakePullRequest = {
  url: string;
  /** Clamped `max(1, min(250, limit))` (class-rest-controller.php:91). */
  limit: number;
  updatedAtGmt: string;
  orderId: number;
  sequence: number;
  /** Strict boolean: 'false'/'0'/'' are FALSE, like rest_sanitize_boolean (:97). */
  includeDeletes: boolean;
  /** 'identity' only when requested verbatim; anything else sanitizes to 'host-default' (:478-484). */
  compression: 'host-default' | 'identity';
  /** Parsed `order_fields` list, or null when absent/blank (:244-257). */
  orderFields: string[] | null;
  /** Sanitized benchmark profile; unknown values fall back to 'good-local' (:486-492). */
  benchmarkProfile: 'good-local' | 'slow-php' | 'slow-db' | 'large-payload';
};

/** A scripted non-default outcome for a matching request (returned by the script predicate). */
export type FakePullServerFault =
  /**
   * A WP-style HTML error/maintenance page — the ADR 0017 P2L-3d poison. Defaults to STATUS 200
   * (the nastiest case: `response.ok` passes and only the JSON parse can catch it); the client
   * must throw and must NOT advance its cursor.
   */
  | { kind: 'html_page'; status?: number }
  /** A server failure (default 500) carrying the same WP HTML error page body. */
  | { kind: 'error_5xx'; status?: number }
  /**
   * A contract-shaped envelope whose checkpoint does NOT advance (echoes the request cursor)
   * while `hasMore` stays true — the exact condition the adapter's stall guard aborts on.
   * `checkpoint` overrides individual cursor fields (e.g. reformatted-timezone or null values).
   */
  | { kind: 'stall'; checkpoint?: Record<string, unknown> }
  /** A contract-shaped empty page: no documents, cursor echoed, `hasMore: false`. */
  | { kind: 'empty' }
  /**
   * Serve the normal contract response but with scripted transport headers (content-length, …).
   * These are layered OVER the headers the controller always sends, so a value here wins; a `null`
   * value REMOVES a default header, modelling a proxy that strips e.g. `Content-Encoding`.
   */
  | { kind: 'serve'; headers: Record<string, string | null> };

export type FakePullServerSeed = {
  /**
   * The order's stable identity — becomes the document id AND the `_woocommerce_pos_uuid` meta.
   * Must be a standard 8-4-4-4-12 uuid: the PHP only reads identity meta that passes
   * `Woo_RxDB_Sync_Pos_Uuid::is_uuid` (class-pos-uuid.php:25-30), so an order stamped with anything
   * else is invisible to the real serializer and must be to the fake. Use `fakeUuid(n)` for a
   * deterministic one.
   */
  uuid: string;
  wooOrderId: number;
  /** Merged over `{ id: wooOrderId }`; a `date_modified_gmt` here wins the document checkpoint
   * `updatedAtGmt` like the PHP (:178). Re-seeding a known uuid models an order UPDATE. */
  payload?: Record<string, unknown>;
  /** The sync-index row's modified_gmt (MySQL `Y-m-d H:i:s` space form by default, like the index). */
  modifiedGmt?: string;
  /** Explicit journal sequence; must exceed the current head (append-only AUTO_INCREMENT). */
  sequence?: number;
  /** Explicit row revision; defaults to a deterministic advancing `sha256:` token. */
  revision?: string;
};

export type FakePullServer = {
  /** The fetcher to hand to `pullCustomBatch` / `syncCustomPull*` / `runScopeGuardedPull`. */
  fetch: (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;
  /**
   * Script the response for matching requests. The predicate runs on every request BEFORE the
   * contract logic; return a fault to force it, or `undefined` to let the normal path run.
   * Call again to replace the predicate.
   */
  script: (predicate: (request: FakePullRequest) => FakePullServerFault | undefined) => void;
  /** Append a create/update row to the journal (and set the order's served state). */
  seed: (order: FakePullServerSeed) => void;
  /** Append a DELETE row (F6 tombstone) for a wooOrderId; the order stops serializing. */
  remove: (wooOrderId: number, options?: { modifiedGmt?: string; sequence?: number }) => void;
  /**
   * Start a NEW sequence generation (F8): clears the journal + served state, restarts the
   * sequence space at 1, and mints (or adopts) a new epoch — a fresh install / restore.
   */
  resetJournal: (epoch?: string) => void;
  /** The current journal epoch (F8) — what the response's `epoch` field carries. */
  readonly epoch: string;
  /** Every sanitized request received, in order. */
  readonly received: FakePullRequest[];
  /** Every raw response body served, in order (for responseBytes assertions). */
  readonly responseBodies: string[];
};

export type FakePullServerOptions = {
  /** The journal epoch (F8). Defaults to a fixed deterministic token. */
  epoch?: string;
};

const NAMESPACE = '/wc-rxdb-sync/v1/';
/** The route registered under the namespace — the ONLY path the plugin answers (`/orders/pull`). */
const PULL_ROUTE = 'orders/pull';

/** A standard 8-4-4-4-12 uuid, any version — Woo_RxDB_Sync_Pos_Uuid::is_uuid (class-pos-uuid.php:25-30). */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/**
 * A deterministic valid uuid keyed by a small integer, for tests that just need a distinct identity
 * per order: `fakeUuid(7)` → `'00000000-0000-4000-8000-000000000007'`.
 */
export function fakeUuid(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999_999_999_999) {
    throw new Error(`fakeUuid: ${n} must be an integer in [0, 999999999999]`);
  }
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

/** compression_headers_for_mode (class-rest-controller.php:465-474). Every pull carries the Vary /
 * mode / expose triple; an identity pull additionally pins `Content-Encoding: identity` and
 * `Cache-Control: no-transform` so no intermediary re-compresses the body. */
function compressionHeaders(mode: FakePullRequest['compression']): Record<string, string> {
  const headers: Record<string, string> = {
    Vary: 'Accept-Encoding',
    'X-WC-RxDB-Compression-Mode': mode,
    'Access-Control-Expose-Headers': 'Content-Encoding, Content-Length, X-WC-RxDB-Compression-Mode',
  };
  if (mode === 'identity') {
    headers['Cache-Control'] = 'no-transform';
    headers['Content-Encoding'] = 'identity';
  }
  return headers;
}

/** Deterministic metrics matching Woo_RxDB_Sync_Metrics::snapshot (class-metrics.php:35-47) plus
 * the pull extras (class-rest-controller.php:226-231). Distinctive non-zero values so a test that
 * asserts propagation can tell "came from the body" apart from a zero default. */
const FAKE_PHASES = { candidate_query_ms: 1, serialize_documents_ms: 2, assemble_response_ms: 3 } as const;
const FAKE_DURATION_MS = 7;
const FAKE_MEMORY_PEAK_BYTES = 2097152;

/** The WP "critical error" page — what a poisoned pull actually looks like in the field. */
const WP_HTML_ERROR_PAGE = [
  '<!DOCTYPE html>',
  '<html lang="en-US"><head><meta charset="utf-8"><title>WordPress &rsaquo; Error</title></head>',
  '<body id="error-page"><div class="wp-die-message">',
  '<p>There has been a critical error on this website.</p>',
  '</div></body></html>',
].join('\n');

type JournalRow = {
  sequence: number;
  wooOrderId: number;
  modifiedGmt: string;
  revision: string;
  deleted: boolean;
};

type ServedOrderState = {
  uuid: string;
  wooOrderId: number;
  payload: Record<string, unknown>;
};

type MetaDataEntry = { key: string; value: unknown };

/** MySQL `Y-m-d H:i:s` space form — the sync-index stores modified_gmt this way, and the PHP
 * echoes it into checkpoints verbatim (index_row, class-sync-index.php:297-305). */
function defaultModifiedGmt(sequence: number): string {
  const instant = new Date(Date.UTC(2026, 0, 1, 0, 0, 0) + sequence * 60_000);
  return instant.toISOString().slice(0, 19).replace('T', ' ');
}

/** rest_sanitize_boolean's strict semantics: 'false'/'0'/'' ⇒ false (class-rest-controller.php:97). */
function strictBoolean(raw: string | null): boolean {
  if (raw === null) return false;
  const value = raw.trim().toLowerCase();
  return !(value === '' || value === '0' || value === 'false');
}

/** Parse `order_fields` like sparse_fields_for_request (:244-257): each entry through
 * WP `sanitize_key()` (lowercase, keep only a-z0-9_-), blanks dropped, de-duplicated. */
function parseOrderFields(raw: string | null): string[] | null {
  if (raw === null || raw.trim() === '') return null;
  const fields = [...new Set(
    raw
      .split(',')
      .map((field) => field.trim().toLowerCase().replace(/[^a-z0-9_-]/g, ''))
      .filter((field) => field !== ''),
  )];
  return fields.length > 0 ? fields : null;
}

/** filter_payload_fields (:259-...; RestControllerTest.php:345-377): keep requested fields, and the
 * `_woocommerce_pos_uuid` identity meta ALWAYS survives — reduced to exactly the uuid entry. */
function filterPayloadFields(full: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  // Null-prototype accumulator: `sanitize_key` keeps `_`, so a payload key literally spelled
  // `__proto__` reaches this filter. Assigning it onto a plain `{}` runs Object.prototype's setter,
  // which DROPS the field from the payload and re-parents the object — a `{}` here is not enough
  // even with the own-property test below, because that test passes for an own `__proto__` key.
  const filtered: Record<string, unknown> = Object.create(null);
  for (const field of fields) {
    // Own-properties only: PHP array keys have no prototype chain, and copying
    // e.g. `constructor` through `in` would smuggle an inherited name in.
    if (Object.hasOwn(full, field)) {
      filtered[field] = full[field];
    }
  }
  const uuid = readValidUuidFromMeta(full['meta_data']);
  if (uuid !== null) {
    filtered['meta_data'] = [{ key: RECORD_UUID_META_KEY, value: uuid }];
  }
  return filtered;
}

/** Woo_RxDB_Sync_Pos_Uuid::read_valid_uuid_from_meta (class-pos-uuid.php:31-48): the first entry
 * whose value is a well-formed uuid. A blank or malformed value is SKIPPED in favour of a later
 * valid one — production never treats `uuid-1` as an identity. */
function readValidUuidFromMeta(metaData: unknown): string | null {
  if (!Array.isArray(metaData)) return null;
  for (const entry of metaData as MetaDataEntry[]) {
    if (entry && entry.key === RECORD_UUID_META_KEY && isUuid(entry.value)) {
      return entry.value;
    }
  }
  return null;
}

export function createFakePullServer(options: FakePullServerOptions = {}): FakePullServer {
  let epoch = options.epoch ?? 'fake-epoch-1';
  let journal: JournalRow[] = [];
  let stateByWooId = new Map<number, ServedOrderState>();
  const writesByUuid = new Map<string, number>();
  const received: FakePullRequest[] = [];
  const responseBodies: string[] = [];
  let scriptFn: (request: FakePullRequest) => FakePullServerFault | undefined = () => undefined;

  const headSequence = (): number =>
    journal.reduce((head, row) => Math.max(head, row.sequence), 0); // class-sync-index.php:125-132

  const nextSequence = (explicit?: number): number => {
    const head = headSequence();
    if (explicit !== undefined) {
      if (explicit <= head) {
        throw new Error(`fakePullServer: sequence ${explicit} must exceed the journal head ${head} (append-only)`);
      }
      return explicit;
    }
    return head + 1;
  };

  const advanceRevision = (uuid: string): string => {
    const writes = (writesByUuid.get(uuid) ?? 0) + 1;
    writesByUuid.set(uuid, writes);
    // The TRAILING block, not the leading one: `fakeUuid(n)` varies only in its last 12 hex digits,
    // so slicing from the front would mint the same revision for every seeded order.
    return `sha256:${uuid.slice(-8)}-r${writes}`;
  };

  const htmlResponse = (status: number): Response =>
    new Response(WP_HTML_ERROR_PAGE, { status, headers: { 'content-type': 'text/html; charset=UTF-8' } });

  /** Every 200 carries the controller's compression headers for the requested mode; a `serve` fault
   * layers its scripted transport headers over them (`null` strips one, like a mangling proxy). */
  const envelopeResponse = (
    request: FakePullRequest,
    envelope: Record<string, unknown>,
    scripted: Record<string, string | null> = {},
  ): Response => {
    const body = JSON.stringify(envelope);
    responseBodies.push(body);
    const headers = new Headers({
      'content-type': 'application/json; charset=UTF-8',
      ...compressionHeaders(request.compression),
    });
    for (const [name, value] of Object.entries(scripted)) {
      if (value === null) headers.delete(name);
      else headers.set(name, value);
    }
    return new Response(body, { status: 200, headers });
  };

  const metricsSnapshot = (request: FakePullRequest, documentCount: number): Record<string, unknown> => ({
    // class-metrics.php:35-47 …
    duration_ms: FAKE_DURATION_MS,
    memory_peak_bytes: FAKE_MEMORY_PEAK_BYTES,
    phases: { ...FAKE_PHASES },
    // … + the pull extras, class-rest-controller.php:226-231.
    document_count: documentCount,
    compression_mode: request.compression,
    cache_transform: request.compression === 'identity' ? 'no-transform' : 'host-managed',
    server_profile: request.benchmarkProfile,
  });

  /**
   * The full envelope for a scripted stall/empty page: contract-shaped, cursor echoed.
   *
   * `raiseHeadToCursor` is the difference between the two faults, and it is a contract distinction,
   * not a convenience:
   *  - a STALL is a server still serving the client's generation (`hasMore` true, cursor frozen), so
   *    its `head` cannot sit BELOW the echoed cursor — a server reporting a cursor at sequence N has
   *    a journal head ≥ N. (Discovered converting the stall tests: head < checkpoint.sequence used to
   *    flip the adapter's cursor-past-head resync every other page in an infinite resync↔advance loop
   *    a contract-faithful server cannot produce; since B7 the adapter throws CustomPullPoisonError
   *    on that shape, but a stall fault emitting it would then pin the WRONG guard.)
   *  - an EMPTY page reports the journal's ACTUAL `MAX(sequence)`, which after a `resetJournal` is
   *    legitimately below a stale client cursor. That is the F8 `cursorPastHead` case, and masking it
   *    by raising `head` would hide the very resync the adapter exists to perform.
   */
  const echoEnvelope = (
    request: FakePullRequest,
    hasMore: boolean,
    options: { checkpoint?: Record<string, unknown>; raiseHeadToCursor?: boolean } = {},
  ): Record<string, unknown> => {
    const checkpoint = {
      updatedAtGmt: request.updatedAtGmt,
      orderId: request.orderId,
      revision: '',
      sequence: request.sequence,
      ...(options.checkpoint ?? {}),
    };
    const echoedSequence = typeof checkpoint.sequence === 'number' ? checkpoint.sequence : request.sequence;
    return {
      documents: [],
      deletes: [],
      checkpoint,
      hasMore,
      epoch,
      head: options.raiseHeadToCursor ? Math.max(headSequence(), echoedSequence) : headSequence(),
      metrics: metricsSnapshot(request, 0),
    };
  };

  /** pull_orders' assembly loop, mirrored step for step (class-rest-controller.php:104-231). */
  const contractEnvelope = (request: FakePullRequest): Record<string, unknown> => {
    // rows_after_sequence: WHERE sequence > cursor ORDER BY sequence ASC LIMIT limit+1
    // (class-sync-index.php:285-292) + the hasMore probe (:106-109).
    const rows = journal
      .filter((row) => row.sequence > request.sequence)
      .sort((a, b) => a.sequence - b.sequence)
      .slice(0, request.limit + 1);
    const hasMore = rows.length > request.limit;
    const page = rows.slice(0, request.limit);

    // latest_sequence_by_order — per-page coalescing input (:110, :139-148).
    const latestSequenceByOrder = new Map<number, number>();
    for (const row of page) {
      latestSequenceByOrder.set(row.wooOrderId, row.sequence);
    }

    // The response checkpoint starts at the REQUEST cursor (:120-125) and only advances per row.
    let responseCheckpoint: SyncCheckpoint = {
      updatedAtGmt: request.updatedAtGmt,
      orderId: request.orderId,
      revision: '',
      sequence: request.sequence,
    };
    const documents: OrderDocument[] = [];
    const deletes: number[] = [];

    for (const row of page) {
      const rowCheckpoint: SyncCheckpoint = {
        updatedAtGmt: row.modifiedGmt,
        orderId: row.wooOrderId,
        revision: row.revision,
        sequence: row.sequence,
      };

      // Coalesce to the order's LATEST row within this page (:139-148).
      if (row.sequence !== latestSequenceByOrder.get(row.wooOrderId)) {
        responseCheckpoint = rowCheckpoint;
        continue;
      }

      // A deleted row never emits a document; it reaches the delete channel only when the client
      // opted in — and the checkpoint always advances past it (:150-161).
      if (row.deleted) {
        if (request.includeDeletes) {
          deletes.push(row.wooOrderId);
        }
        responseCheckpoint = rowCheckpoint;
        continue;
      }

      // serialize_order — an order with no served state permanently skips (:163-172).
      const state = stateByWooId.get(row.wooOrderId);
      if (!state) {
        responseCheckpoint = rowCheckpoint;
        continue;
      }

      const baseMeta = Array.isArray(state.payload['meta_data']) ? (state.payload['meta_data'] as MetaDataEntry[]) : [];
      const fullPayload: Record<string, unknown> = {
        id: state.wooOrderId,
        ...state.payload,
        // serialize_order always stamps the identity meta (:185-194) — the uuid entry is ensured.
        meta_data:
          readValidUuidFromMeta(baseMeta) === state.uuid
            ? baseMeta
            : [...baseMeta.filter((entry) => entry?.key !== RECORD_UUID_META_KEY), { key: RECORD_UUID_META_KEY, value: state.uuid }],
      };
      const isPartial = request.orderFields !== null;
      const payload = isPartial ? filterPayloadFields(fullPayload, request.orderFields as string[]) : fullPayload;
      const revision = row.revision;
      // A payload date_modified_gmt wins the document checkpoint's updatedAtGmt (:178).
      const modified =
        typeof fullPayload['date_modified_gmt'] === 'string' ? (fullPayload['date_modified_gmt'] as string) : row.modifiedGmt;
      const documentCheckpoint: SyncCheckpoint = {
        updatedAtGmt: modified,
        orderId: row.wooOrderId,
        revision,
        sequence: row.sequence,
      };
      documents.push({
        id: state.uuid,
        wooOrderId: row.wooOrderId,
        payload,
        sync: { revision, checkpoint: documentCheckpoint, partial: isPartial, source: 'custom-pull' },
        local: { dirty: false, pendingMutationIds: [] },
      });
      responseCheckpoint = documentCheckpoint; // emitted — safe to advance (:207)
    }

    // Envelope key order exactly as assembled by the PHP (:216-231): documents, deletes,
    // checkpoint, hasMore, epoch, head — then metrics appended.
    return {
      documents,
      deletes,
      checkpoint: responseCheckpoint,
      hasMore,
      epoch,
      head: headSequence(),
      metrics: metricsSnapshot(request, documents.length),
    };
  };

  const parseRequest = (url: string): FakePullRequest | null => {
    const queryStart = url.indexOf('?');
    const path = queryStart === -1 ? url : url.slice(0, queryStart);
    const firstNs = path.indexOf(NAMESPACE);
    // Doubled/missing-namespace guard, like fakeWriteServer's parsePushUrl.
    if (firstNs === -1 || path.indexOf(NAMESPACE, firstNs + 1) !== -1) return null;
    // WP dispatches on the WHOLE route under the namespace, so the remainder must be exactly
    // `orders/pull`. A baseUrl carrying a stray segment (`…/v1/orders`) builds `…/v1/orders/orders/pull`,
    // which the plugin registers no route for — a suffix match would serve it a valid envelope.
    if (path.slice(firstNs + NAMESPACE.length) !== PULL_ROUTE) return null;
    const params = new URLSearchParams(queryStart === -1 ? '' : url.slice(queryStart + 1));
    const compressionRaw = params.get('compression');
    const profileRaw = params.get('benchmark_profile');
    return {
      url,
      limit: Math.max(1, Math.min(250, Number.parseInt(params.get('limit') ?? '0', 10) || 0)),
      updatedAtGmt: params.get('updated_at_gmt') ?? '1970-01-01T00:00:00.000Z',
      orderId: Number.parseInt(params.get('order_id') ?? '0', 10) || 0,
      sequence: Number.parseInt(params.get('sequence') ?? '0', 10) || 0,
      includeDeletes: strictBoolean(params.get('include_deletes')),
      compression: compressionRaw === 'identity' ? 'identity' : 'host-default',
      orderFields: parseOrderFields(params.get('order_fields')),
      benchmarkProfile:
        profileRaw === 'slow-php' || profileRaw === 'slow-db' || profileRaw === 'large-payload' || profileRaw === 'good-local'
          ? profileRaw
          : 'good-local',
    };
  };

  return {
    received,
    responseBodies,
    get epoch(): string {
      return epoch;
    },
    script: (predicate) => {
      scriptFn = predicate;
    },
    seed: (order) => {
      // serialize_order reads the identity through read_valid_uuid_from_meta, so an order whose
      // uuid is not uuid-shaped could never be emitted by the PHP (class-pos-uuid.php:25-48).
      if (!isUuid(order.uuid)) {
        throw new Error(`fakePullServer: seed uuid ${JSON.stringify(order.uuid)} is not a uuid — use fakeUuid(n)`);
      }
      const sequence = nextSequence(order.sequence);
      const revision = order.revision ?? advanceRevision(order.uuid);
      stateByWooId.set(order.wooOrderId, {
        uuid: order.uuid,
        wooOrderId: order.wooOrderId,
        payload: order.payload ?? {},
      });
      journal.push({
        sequence,
        wooOrderId: order.wooOrderId,
        modifiedGmt: order.modifiedGmt ?? defaultModifiedGmt(sequence),
        revision,
        deleted: false,
      });
    },
    remove: (wooOrderId, removeOptions = {}) => {
      const sequence = nextSequence(removeOptions.sequence);
      stateByWooId.delete(wooOrderId); // like a hard delete: the order no longer serializes
      journal.push({
        sequence,
        wooOrderId,
        modifiedGmt: removeOptions.modifiedGmt ?? defaultModifiedGmt(sequence),
        revision: 'deleted', // the index writes the literal 'deleted' for tombstone rows
        deleted: true,
      });
    },
    resetJournal: (nextEpoch) => {
      journal = [];
      stateByWooId = new Map();
      writesByUuid.clear();
      epoch = nextEpoch ?? `${epoch}-next`;
    },
    fetch: async (url: string, init?: { signal?: AbortSignal }) => {
      // Model the Fetch contract for an already-aborted signal: reject before any work,
      // like the real fetch does (the adapters forward their AbortSignal here). Runs before
      // `received` is touched, and the 'AbortError' name is load-bearing — classifyScopeError
      // and recordPushAdapter match on it to tell an abort from a transport error.
      if (init?.signal?.aborted) {
        throw init.signal.reason instanceof Error
          ? init.signal.reason
          : new DOMException('The operation was aborted.', 'AbortError');
      }
      const request = parseRequest(url);
      if (!request) {
        // WP's routerless answer for a bad path — a JSON 404, not the pull envelope.
        return new Response(
          JSON.stringify({ code: 'rest_no_route', message: 'No route was found matching the URL and request method.', data: { status: 404 } }),
          { status: 404, headers: { 'content-type': 'application/json; charset=UTF-8' } },
        );
      }
      received.push(request);

      const fault = scriptFn(request);
      if (fault) {
        switch (fault.kind) {
          case 'html_page':
            return htmlResponse(fault.status ?? 200);
          case 'error_5xx':
            return htmlResponse(fault.status ?? 500);
          case 'stall':
            return envelopeResponse(request, echoEnvelope(request, true, { checkpoint: fault.checkpoint, raiseHeadToCursor: true }));
          case 'empty':
            return envelopeResponse(request, echoEnvelope(request, false));
          case 'serve':
            return envelopeResponse(request, contractEnvelope(request), fault.headers);
        }
      }

      return envelopeResponse(request, contractEnvelope(request));
    },
  };
}
