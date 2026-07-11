import { describe, expect, it } from 'vitest';
import { normalizeCheckpoint } from '@woo-rxdb-lab/shared';
import { pullCustomBatch, syncCustomPullBatchIntoRepository } from './customPullAdapter';
import { createFakePullServer, fakeUuid } from './fakePullServer';
import { classifyScopeError } from './scopeGuardedOperation';

/**
 * Contract tests for the fake PULL server: every pinned shape below is copied from what the PHP
 * actually emits — `pull_orders` (plugins/woo-rxdb-sync/includes/class-rest-controller.php:84-238)
 * and its tests (plugins/woo-rxdb-sync/tests/RestControllerTest.php) — never invented here. If a
 * pin breaks, either the fake drifted from the PHP or the PHP contract changed; fix the fake.
 */

const BASE_URL = 'http://wcpos.local/wp-json/wc-rxdb-sync/v1';
const UUID = '5b8e1a3c-2f4d-4a6b-9c8e-1d2f3a4b5c6d'; // RestControllerTest.php:351

function pullUrl(query: Record<string, string>): string {
  return `${BASE_URL}/orders/pull?${new URLSearchParams(query).toString()}`;
}

const ZERO_CURSOR = { limit: '10', updated_at_gmt: '1970-01-01T00:00:00.000Z', order_id: '0', sequence: '0' };

describe('fakePullServer envelope byte-shape (pinned against the PHP emit)', () => {
  it('serves one emitted order exactly as pull_orders assembles it — keys, order, and values', async () => {
    const server = createFakePullServer({ epoch: 'epoch-xyz' }); // RestControllerTest.php:40,59
    server.seed({
      uuid: UUID,
      wooOrderId: 999,
      payload: { status: 'processing' },
      sequence: 42, // the sync-index row the PHP tests use (RestControllerTest.php:69-76)
      modifiedGmt: '2026-05-19 20:00:00', // index modified_gmt is the MySQL space form
      revision: 'sha256:r1',
    });

    const response = await server.fetch(pullUrl(ZERO_CURSOR));
    const body = await response.text();

    // The full envelope, byte for byte, in the PHP's assembly order:
    // documents/deletes/checkpoint/hasMore/epoch/head (class-rest-controller.php:216-224) then
    // metrics (:226-231); document shape from :195-206; checkpoint keys from :179-184; metrics
    // snapshot shape from class-metrics.php:35-47 + the :226-231 extras.
    expect(body).toBe(JSON.stringify({
      documents: [{
        id: UUID, // P0-1: keyed by the order's stable uuid, never a synthetic id (:185-196)
        wooOrderId: 999,
        payload: { id: 999, status: 'processing', meta_data: [{ key: '_woocommerce_pos_uuid', value: UUID }] },
        sync: {
          revision: 'sha256:r1',
          checkpoint: { updatedAtGmt: '2026-05-19 20:00:00', orderId: 999, revision: 'sha256:r1', sequence: 42 },
          partial: false,
          source: 'custom-pull',
        },
        local: { dirty: false, pendingMutationIds: [] },
      }],
      deletes: [],
      checkpoint: { updatedAtGmt: '2026-05-19 20:00:00', orderId: 999, revision: 'sha256:r1', sequence: 42 },
      hasMore: false,
      epoch: 'epoch-xyz',
      head: 42,
      metrics: {
        duration_ms: 7,
        memory_peak_bytes: 2097152,
        phases: { candidate_query_ms: 1, serialize_documents_ms: 2, assemble_response_ms: 3 },
        document_count: 1,
        compression_mode: 'host-default',
        cache_transform: 'host-managed',
        server_profile: 'good-local',
      },
    }));
  });

  it('echoes the REQUEST cursor when no rows qualify — revision empty, nothing advanced', async () => {
    // The response checkpoint STARTS at the request's checkpoint (class-rest-controller.php:116-125).
    const server = createFakePullServer();

    const response = await server.fetch(pullUrl({ limit: '10', updated_at_gmt: '2026-05-20T10:00:00.000Z', order_id: '10', sequence: '10' }));
    const envelope = await response.json();

    expect(envelope.documents).toEqual([]);
    expect(envelope.checkpoint).toEqual({ updatedAtGmt: '2026-05-20T10:00:00.000Z', orderId: 10, revision: '', sequence: 10 });
    expect(envelope.hasMore).toBe(false);
  });
});

describe('fakePullServer journal semantics (pinned against pull_orders + Sync_Index)', () => {
  it('pages by sequence with the limit+1 hasMore probe, like rows_after_sequence', async () => {
    // class-sync-index.php:285-292 (WHERE sequence > cursor ORDER BY sequence ASC LIMIT limit+1)
    // + the probe/slice at class-rest-controller.php:106-109.
    const server = createFakePullServer();
    server.seed({ uuid: fakeUuid(1), wooOrderId: 1 });
    server.seed({ uuid: fakeUuid(2), wooOrderId: 2 });

    const first = await (await server.fetch(pullUrl({ ...ZERO_CURSOR, limit: '1' }))).json();
    expect(first.documents.map((d: { wooOrderId: number }) => d.wooOrderId)).toEqual([1]);
    expect(first.hasMore).toBe(true);
    expect(first.checkpoint.sequence).toBe(1);

    const second = await (await server.fetch(pullUrl({ ...ZERO_CURSOR, limit: '1', sequence: String(first.checkpoint.sequence) }))).json();
    expect(second.documents.map((d: { wooOrderId: number }) => d.wooOrderId)).toEqual([2]);
    expect(second.hasMore).toBe(false);
    expect(second.checkpoint.sequence).toBe(2);
  });

  it('silently skips a deleted row without include_deletes, but still advances the checkpoint', async () => {
    // RestControllerTest.php:63-98 — sequence 42/order 999 deleted row: empty channels, cursor moves.
    const server = createFakePullServer();
    server.seed({ uuid: UUID, wooOrderId: 999, sequence: 41 });
    server.remove(999, { sequence: 42, modifiedGmt: '2026-05-19 20:00:00' });

    const envelope = await (await server.fetch(pullUrl({ ...ZERO_CURSOR, sequence: '41' }))).json();

    expect(envelope.documents).toEqual([]);
    expect(envelope.deletes).toEqual([]);
    expect(envelope.checkpoint.sequence).toBe(42);
    expect(envelope.checkpoint.orderId).toBe(999);
  });

  it('emits an F6 tombstone for a deleted order when include_deletes is set', async () => {
    // RestControllerTest.php:128-136.
    const server = createFakePullServer();
    server.seed({ uuid: UUID, wooOrderId: 999, sequence: 41 });
    server.remove(999, { sequence: 42 });

    const envelope = await (await server.fetch(pullUrl({ ...ZERO_CURSOR, sequence: '41', include_deletes: 'true' }))).json();

    expect(envelope.documents).toEqual([]);
    expect(envelope.deletes).toEqual([999]);
    expect(envelope.checkpoint.sequence).toBe(42);
  });

  it("treats include_deletes='false' as OFF, like rest_sanitize_boolean", async () => {
    // RestControllerTest.php:147-155 — `(bool) 'false'` would be true; the strict parse is false.
    const server = createFakePullServer();
    server.seed({ uuid: UUID, wooOrderId: 999, sequence: 41 });
    server.remove(999, { sequence: 42 });

    const envelope = await (await server.fetch(pullUrl({ ...ZERO_CURSOR, sequence: '41', include_deletes: 'false' }))).json();

    expect(envelope.deletes).toEqual([]);
    expect(envelope.checkpoint.sequence).toBe(42);
  });

  it('coalesces update-then-delete in one page to a tombstone only', async () => {
    // RestControllerTest.php:177-190 — the superseded update must NOT surface as a document.
    const server = createFakePullServer();
    server.seed({ uuid: UUID, wooOrderId: 999, sequence: 41 });
    server.remove(999, { sequence: 42 });

    const envelope = await (await server.fetch(pullUrl({ ...ZERO_CURSOR, include_deletes: 'true' }))).json();

    expect(envelope.documents).toEqual([]);
    expect(envelope.deletes).toEqual([999]);
    expect(envelope.checkpoint.sequence).toBe(42);
  });

  it('coalesces delete-then-restore in one page to a document only', async () => {
    // RestControllerTest.php:192-204 — a trailing tombstone would wrongly remove a restored order.
    const server = createFakePullServer();
    server.seed({ uuid: UUID, wooOrderId: 999, sequence: 40 });
    server.remove(999, { sequence: 41 });
    server.seed({ uuid: UUID, wooOrderId: 999, sequence: 42 });

    const envelope = await (await server.fetch(pullUrl({ ...ZERO_CURSOR, include_deletes: 'true' }))).json();

    expect(envelope.deletes).toEqual([]);
    expect(envelope.documents).toHaveLength(1);
    expect(envelope.documents[0].wooOrderId).toBe(999);
    expect(envelope.checkpoint.sequence).toBe(42);
  });

  it('filters sparse order_fields but the uuid identity meta ALWAYS survives, partial flipped', async () => {
    // RestControllerTest.php:309-343 + :345-367 — sparse payloads keep _woocommerce_pos_uuid.
    const server = createFakePullServer();
    server.seed({ uuid: UUID, wooOrderId: 10, payload: { status: 'processing', currency: 'USD', total: '42.00' } });

    // Each entry runs through WP `sanitize_key()` before it reaches the filter (:244-257): `ID`
    // lowercases, `total!!` loses the illegal chars, the repeated `status` de-duplicates, and the
    // trailing blanks drop — so the server must see exactly ['id', 'status', 'total'].
    const envelope = await (await server.fetch(pullUrl({ ...ZERO_CURSOR, order_fields: 'ID,status,status,total!!,,' }))).json();

    expect(server.received[0].orderFields).toEqual(['id', 'status', 'total']);

    const document = envelope.documents[0];
    expect(document.sync.partial).toBe(true);
    expect(document.sync.source).toBe('custom-pull');
    expect(document.payload).toEqual({
      id: 10,
      status: 'processing',
      total: '42.00',
      meta_data: [{ key: '_woocommerce_pos_uuid', value: UUID }],
    });
    expect(document.payload.currency).toBeUndefined();
  });

  it('matches sparse order_fields against OWN payload keys only — inherited names are not "present"', async () => {
    // `sanitize_key` keeps `_`, so `constructor` and `__proto__` survive parsing and reach the filter.
    // The PHP tests membership with `array_key_exists`, which has no prototype chain: an inherited
    // name is simply absent, and a payload key that happens to be spelled `__proto__` is data.
    const server = createFakePullServer();
    // JSON.parse is how a real payload arrives — it mints `__proto__` as an OWN data property.
    const payload = JSON.parse('{"status":"processing","__proto__":{"polluted":"yes"}}');
    server.seed({ uuid: UUID, wooOrderId: 10, payload });

    const envelope = await (await server.fetch(pullUrl({ ...ZERO_CURSOR, order_fields: 'constructor,__proto__,status' }))).json();

    const served = envelope.documents[0].payload;
    // `constructor` is inherited, never an own key: it must not be smuggled into the payload.
    expect(Object.prototype.hasOwnProperty.call(served, 'constructor')).toBe(false);
    // `__proto__` IS an own key here, so it is carried as ordinary data rather than being swallowed
    // by Object.prototype's setter (which would drop the field AND re-parent the served object).
    expect(Object.prototype.hasOwnProperty.call(served, '__proto__')).toBe(true);
    expect(served['__proto__']).toEqual({ polluted: 'yes' });
    expect(served.status).toBe('processing');
    // Nothing escaped onto the shared prototype.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted')).toBe(false);
  });

  it('surfaces the F8 journal epoch and head, and resetJournal starts a new generation', async () => {
    // RestControllerTest.php:37-61 (epoch + head siblings of the checkpoint).
    const server = createFakePullServer({ epoch: 'epoch-A' });
    server.seed({ uuid: UUID, wooOrderId: 1, sequence: 512 });

    const before = await (await server.fetch(pullUrl(ZERO_CURSOR))).json();
    expect(before.epoch).toBe('epoch-A');
    expect(before.head).toBe(512);

    server.resetJournal('epoch-B');
    const after = await (await server.fetch(pullUrl(ZERO_CURSOR))).json();
    expect(after.epoch).toBe('epoch-B');
    expect(after.head).toBe(0);
    expect(after.documents).toEqual([]);
  });

  it('answers a misrouted URL with a WP-style rest_no_route 404, never the envelope', async () => {
    const server = createFakePullServer();

    const doubled = await server.fetch(`${BASE_URL}/wc-rxdb-sync/v1/orders/pull?limit=1`);
    expect(doubled.status).toBe(404);
    expect((await doubled.json()).code).toBe('rest_no_route');

    const wrongPath = await server.fetch(`${BASE_URL}/orders/pull/extra?limit=1`);
    expect(wrongPath.status).toBe(404);
  });

  it('404s a stray segment BETWEEN the namespace and the route — the plugin registers only /orders/pull', async () => {
    // A `baseUrl` that already carries `/orders` builds `…/v1/orders/orders/pull`. WP matches the
    // whole route under the namespace, so no route exists; a suffix match would serve an envelope.
    const server = createFakePullServer();
    server.seed({ uuid: UUID, wooOrderId: 1 });

    for (const path of ['/orders/orders/pull', '/foo/orders/pull', '/v2/orders/pull']) {
      const response = await server.fetch(`${BASE_URL}${path}?limit=1`);
      expect(response.status, path).toBe(404);
      expect((await response.json()).code, path).toBe('rest_no_route');
    }

    expect(server.received).toEqual([]); // never reached the contract logic
    expect(server.responseBodies).toEqual([]);
  });
});

describe('fakePullServer identity meta (Woo_RxDB_Sync_Pos_Uuid)', () => {
  it('seed rejects an identity the PHP would never read as a uuid', () => {
    const server = createFakePullServer();

    // read_valid_uuid_from_meta only accepts the 8-4-4-4-12 shape (class-pos-uuid.php:25-48), so a
    // fake that emitted `uuid-1` would hand the client a document the real serializer cannot produce.
    for (const bogus of ['uuid-1', '', 'not-a-uuid', '5b8e1a3c2f4d4a6b9c8e1d2f3a4b5c6d']) {
      expect(() => server.seed({ uuid: bogus, wooOrderId: 1 })).toThrow(/is not a uuid/);
    }

    expect(() => server.seed({ uuid: UUID.toUpperCase(), wooOrderId: 1 })).not.toThrow(); // any case, any version
  });

  it('fakeUuid mints a distinct, well-formed identity per order', () => {
    expect(fakeUuid(7)).toBe('00000000-0000-4000-8000-000000000007');
    expect(fakeUuid(7)).not.toBe(fakeUuid(8));
    const server = createFakePullServer();
    expect(() => server.seed({ uuid: fakeUuid(7), wooOrderId: 7 })).not.toThrow();
    expect(() => fakeUuid(1.5)).toThrow();
  });

  it('mints distinct default revisions for orders whose uuids share a prefix', async () => {
    const server = createFakePullServer();
    server.seed({ uuid: fakeUuid(1), wooOrderId: 1 });
    server.seed({ uuid: fakeUuid(2), wooOrderId: 2 });

    const envelope = await (await server.fetch(pullUrl(ZERO_CURSOR))).json();

    const revisions = envelope.documents.map((document: { sync: { revision: string } }) => document.sync.revision);
    expect(new Set(revisions).size).toBe(2);
  });

  it('replaces a malformed identity meta entry rather than serving it, like serialize_order', async () => {
    // read_valid_uuid_from_meta SKIPS a blank/malformed value, so the serializer restamps the meta.
    const server = createFakePullServer();
    server.seed({
      uuid: UUID,
      wooOrderId: 1,
      payload: { status: 'processing', meta_data: [{ key: '_woocommerce_pos_uuid', value: 'uuid-1' }] },
    });

    const envelope = await (await server.fetch(pullUrl(ZERO_CURSOR))).json();

    expect(envelope.documents[0].payload.meta_data).toEqual([{ key: '_woocommerce_pos_uuid', value: UUID }]);
  });

  it('prefers a later VALID identity over an earlier malformed duplicate', async () => {
    const server = createFakePullServer();
    server.seed({
      uuid: UUID,
      wooOrderId: 1,
      payload: {
        status: 'processing',
        meta_data: [
          { key: '_woocommerce_pos_uuid', value: '' },
          { key: '_woocommerce_pos_uuid', value: UUID },
        ],
      },
    });

    // The sparse filter reduces the meta to exactly the one valid uuid entry it found.
    const envelope = await (await server.fetch(pullUrl({ ...ZERO_CURSOR, order_fields: 'status' }))).json();

    expect(envelope.documents[0].payload.meta_data).toEqual([{ key: '_woocommerce_pos_uuid', value: UUID }]);
  });
});

describe('fakePullServer compression headers (compression_headers_for_mode)', () => {
  it('pins Content-Encoding + Cache-Control on an identity pull, with no serve script', async () => {
    // class-rest-controller.php:465-474 — the controller ALWAYS applies these; a fake that omitted
    // them would let an adapter's identity control silently pass on a body that was never pinned.
    const server = createFakePullServer();
    server.seed({ uuid: UUID, wooOrderId: 1 });

    const response = await server.fetch(pullUrl({ ...ZERO_CURSOR, compression: 'identity' }));

    expect(response.headers.get('content-encoding')).toBe('identity');
    expect(response.headers.get('cache-control')).toBe('no-transform');
    expect(response.headers.get('vary')).toBe('Accept-Encoding');
    expect(response.headers.get('x-wc-rxdb-compression-mode')).toBe('identity');
  });

  it('sends the mode triple but NO identity pins on a host-default pull', async () => {
    const server = createFakePullServer();
    server.seed({ uuid: UUID, wooOrderId: 1 });

    const response = await server.fetch(pullUrl({ ...ZERO_CURSOR, compression: 'host-default' }));

    expect(response.headers.get('content-encoding')).toBeNull(); // the host layer decides
    expect(response.headers.get('cache-control')).toBeNull();
    expect(response.headers.get('x-wc-rxdb-compression-mode')).toBe('host-default');
  });

  it('applies the defaults to a scripted stall/empty page too, not just the contract path', async () => {
    const server = createFakePullServer();
    server.script(() => ({ kind: 'empty' }));

    const response = await server.fetch(pullUrl({ ...ZERO_CURSOR, compression: 'identity' }));

    expect(response.headers.get('content-encoding')).toBe('identity');
  });

  it('a serve script overrides a default header, and null strips it like a mangling proxy', async () => {
    const server = createFakePullServer();
    server.seed({ uuid: UUID, wooOrderId: 1 });

    server.script(() => ({ kind: 'serve', headers: { 'content-encoding': 'gzip' } }));
    const overridden = await server.fetch(pullUrl({ ...ZERO_CURSOR, compression: 'identity' }));
    expect(overridden.headers.get('content-encoding')).toBe('gzip'); // host ignored the identity ask
    expect(overridden.headers.get('cache-control')).toBe('no-transform'); // untouched default survives

    server.script(() => ({ kind: 'serve', headers: { 'content-encoding': null } }));
    const stripped = await server.fetch(pullUrl({ ...ZERO_CURSOR, compression: 'identity' }));
    expect(stripped.headers.get('content-encoding')).toBeNull();
  });
});

describe('fakePullServer fault injection', () => {
  it('html_page serves a 200 WP HTML error page the pull adapter must treat as poison', async () => {
    // ADR 0017 P2L-3d: a WP maintenance/error page must never advance the cursor. In the batch
    // pull path the protection is the JSON parse throwing BEFORE any checkpoint write.
    const server = createFakePullServer();
    server.seed({ uuid: UUID, wooOrderId: 1 });
    server.script(() => ({ kind: 'html_page' }));
    const checkpointWrites: unknown[] = [];
    const store = {
      readCustomPullCheckpoint: async () => normalizeCheckpoint(null),
      writeCustomPullCheckpoint: async (checkpoint: unknown) => {
        checkpointWrites.push(checkpoint);
      },
    };
    const repository = { upsertMany: async () => undefined };

    await expect(syncCustomPullBatchIntoRepository({
      baseUrl: BASE_URL,
      limit: 10,
      repository,
      checkpointStore: store,
      fetcher: server.fetch,
    })).rejects.toThrow(); // SyntaxError from parsing the HTML body

    expect(checkpointWrites).toEqual([]); // the poison page never advanced the cursor

    const raw = await server.fetch(pullUrl(ZERO_CURSOR));
    expect(raw.status).toBe(200); // response.ok passes — only the parse catches it
    expect(raw.headers.get('content-type')).toContain('text/html');
    expect(await raw.text()).toContain('There has been a critical error on this website.');
  });

  it('error_5xx makes pullCustomBatch throw its HTTP-status error', async () => {
    const server = createFakePullServer();
    server.script(() => ({ kind: 'error_5xx' }));

    await expect(pullCustomBatch({
      baseUrl: BASE_URL,
      checkpoint: null,
      limit: 10,
      fetcher: server.fetch,
    })).rejects.toThrow('Custom pull failed: 500');
  });

  it('stall echoes the request cursor with hasMore=true in a fully contract-shaped envelope', async () => {
    const server = createFakePullServer();
    server.script(() => ({ kind: 'stall' }));

    const envelope = await (await server.fetch(pullUrl({ limit: '10', updated_at_gmt: '2026-05-20T10:00:00.000Z', order_id: '7', sequence: '7' }))).json();

    expect(envelope.documents).toEqual([]);
    expect(envelope.checkpoint).toEqual({ updatedAtGmt: '2026-05-20T10:00:00.000Z', orderId: 7, revision: '', sequence: 7 });
    expect(envelope.hasMore).toBe(true);
    expect(Object.keys(envelope)).toEqual(['documents', 'deletes', 'checkpoint', 'hasMore', 'epoch', 'head', 'metrics']);
  });

  it('stall keeps head at or above the echoed cursor — a stalling server is not a reset one', async () => {
    // Unlike `empty`, a stall claims to still be serving the client's generation (hasMore=true), so
    // head < cursor would trip the F8 resync every other page and mask the stall the fault exists to
    // provoke. This is the one place the fake deliberately raises `head`.
    const server = createFakePullServer();
    server.script(() => ({ kind: 'stall' }));

    const envelope = await (await server.fetch(pullUrl({ ...ZERO_CURSOR, sequence: '512' }))).json();

    expect(envelope.head).toBe(512);
  });

  it('empty serves a valid empty page with hasMore=false', async () => {
    const server = createFakePullServer();
    server.seed({ uuid: UUID, wooOrderId: 1 }); // present, but the fault wins
    server.script(() => ({ kind: 'empty' }));

    const envelope = await (await server.fetch(pullUrl(ZERO_CURSOR))).json();

    expect(envelope.documents).toEqual([]);
    expect(envelope.hasMore).toBe(false);
  });

  it('empty reports the REAL journal head, which after a reset sits below a stale client cursor', async () => {
    // A real empty pull answers MAX(sequence); it does not raise `head` to the cursor it was asked
    // about. Raising it would hide a journal reset from the F8 guard.
    const server = createFakePullServer({ epoch: 'epoch-A' });
    server.seed({ uuid: UUID, wooOrderId: 1, sequence: 512 });
    server.resetJournal('epoch-A'); // SAME epoch: only `head` can reveal the reset
    server.script(() => ({ kind: 'empty' }));

    const envelope = await (await server.fetch(pullUrl({ ...ZERO_CURSOR, sequence: '512' }))).json();

    expect(envelope.checkpoint.sequence).toBe(512); // the cursor is still echoed
    expect(envelope.head).toBe(0); // …but the journal really is empty
  });

  it('an empty page below the cursor drives the client through the F8 cursorPastHead resync', async () => {
    const server = createFakePullServer({ epoch: 'epoch-A' });
    server.seed({ uuid: UUID, wooOrderId: 1, sequence: 512 });
    server.resetJournal('epoch-A');
    server.script(() => ({ kind: 'empty' }));

    const staleCheckpoint = { updatedAtGmt: '2026-05-20T10:00:00.000Z', orderId: 1, revision: 'r', sequence: 512 };
    const checkpointWrites: unknown[] = [];
    const resyncCalls: unknown[] = [];
    const store = {
      readCustomPullCheckpoint: async () => staleCheckpoint,
      writeCustomPullCheckpoint: async (checkpoint: unknown) => {
        checkpointWrites.push(checkpoint);
      },
      readJournalEpoch: async () => 'epoch-A',
      writeJournalEpoch: async () => undefined,
    };
    const repository = {
      upsertMany: async () => undefined,
      resetForResync: async (pending: unknown) => {
        resyncCalls.push(pending);
      },
    };

    const result = await syncCustomPullBatchIntoRepository({
      baseUrl: BASE_URL,
      limit: 10,
      repository,
      checkpointStore: store,
      fetcher: server.fetch,
    });

    expect(resyncCalls).toHaveLength(1); // the local collection was reconciled
    expect(result.checkpoint).toEqual(normalizeCheckpoint(null)); // …and the cursor went back to zero
    expect(result.hasMore).toBe(true); // re-pull from scratch
    expect(checkpointWrites).toEqual([normalizeCheckpoint(null)]);
  });

  it('serve attaches scripted transport headers to an otherwise-normal contract response', async () => {
    const server = createFakePullServer();
    server.seed({ uuid: UUID, wooOrderId: 1 });
    server.script(() => ({ kind: 'serve', headers: { 'content-length': '42', 'content-encoding': 'gzip' } }));

    const response = await server.fetch(pullUrl(ZERO_CURSOR));

    expect(response.headers.get('content-length')).toBe('42');
    expect(response.headers.get('content-encoding')).toBe('gzip');
    expect((await response.json()).documents).toHaveLength(1);
  });

  it('rejects an already-aborted request with an AbortError, and the server is never reached', async () => {
    // `pullCustomBatch` forwards its signal to the fetcher, so the fake has to honour the Fetch
    // contract: an aborted signal rejects before the request exists. A fake that ignored it would
    // let a cancelled pull serve a page and advance a cursor no real transport would have moved.
    const server = createFakePullServer();
    server.seed({ uuid: UUID, wooOrderId: 1 });
    const controller = new AbortController();
    controller.abort();

    const error = await server.fetch(pullUrl(ZERO_CURSOR), { signal: controller.signal }).then(
      () => null,
      (thrown: unknown) => thrown,
    );

    // Classified BY NAME everywhere in the engine (scopeGuardedOperation.ts:116).
    expect((error as { name?: string } | null)?.name).toBe('AbortError');
    expect(server.received).toEqual([]);
    expect(server.responseBodies).toEqual([]);
  });

  it('surfaces that abort through pullCustomBatch as the engine-wide "aborted" category', async () => {
    const server = createFakePullServer();
    server.seed({ uuid: UUID, wooOrderId: 1 });
    const controller = new AbortController();
    controller.abort();

    const error = await pullCustomBatch({
      baseUrl: BASE_URL,
      checkpoint: null,
      limit: 10,
      fetcher: server.fetch,
      signal: controller.signal,
    }).then(() => null, (thrown: unknown) => thrown);

    expect(classifyScopeError(error).category).toBe('aborted'); // not a transport 'error'
    expect(server.received).toEqual([]);
  });

  it('serves normally when a signal is supplied but never aborted', async () => {
    const server = createFakePullServer();
    server.seed({ uuid: UUID, wooOrderId: 1 });

    const envelope = await (await server.fetch(pullUrl(ZERO_CURSOR), { signal: new AbortController().signal })).json();

    expect(envelope.documents).toHaveLength(1);
  });

  it('faults are not memoised: clearing the script restores normal serving', async () => {
    const server = createFakePullServer();
    server.seed({ uuid: UUID, wooOrderId: 1 });
    let poisoned = true;
    server.script(() => (poisoned ? { kind: 'html_page' } : undefined));

    const first = await server.fetch(pullUrl(ZERO_CURSOR));
    expect(first.headers.get('content-type')).toContain('text/html');

    poisoned = false;
    const second = await (await server.fetch(pullUrl(ZERO_CURSOR))).json();
    expect(second.documents).toHaveLength(1);
  });
});
