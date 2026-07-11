import { describe, expect, it, vi } from 'vitest';
import { RECORD_UUID_META_KEY, type SyncEvent } from '@woo-rxdb-lab/shared';
import type { RecordMutation } from './recordMutation';
import { RecordPushError, pushEndpointResolver, pushRecordMutation, reconcileCreateAck } from './recordPushAdapter';

const UUID = '5b8e1a3c-2f4d-4a6b-9c8e-1d2f3a4b5c6d';

const mut = (over: Partial<RecordMutation> = {}): RecordMutation => ({
  mutationId: 'm1',
  collectionName: 'products',
  operation: 'create',
  recordId: UUID,
  origin: 'minted',
  payload: { name: 'Widget', meta_data: [{ key: RECORD_UUID_META_KEY, value: UUID }] },
  baseRevision: null,
  queuedAt: '2026-06-26T00:00:00.000Z',
  ...over,
});

const jsonResponse = (status: number, body: unknown): Response =>
  ({ status, ok: status >= 200 && status < 300, json: async () => body }) as unknown as Response;

const resolveEndpoint = (m: RecordMutation) => ({ url: `https://x/${m.collectionName}/${m.operation}`, method: 'POST' });

describe('pushRecordMutation', () => {
  it('creates: posts the payload, returns the server document + a created outcome, emits push.outcome', async () => {
    const events: SyncEvent[] = [];
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse(201, { id: 4242, meta_data: [{ key: RECORD_UUID_META_KEY, value: UUID }] }));
    const result = await pushRecordMutation({ mutation: mut(), resolveEndpoint, fetcher, observe: (e) => events.push(e) });
    expect(result.outcome).toBe('created');
    expect(result.document).toEqual({ id: 4242, meta_data: [{ key: RECORD_UUID_META_KEY, value: UUID }] });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://x/products/create');
    // the full envelope is sent — the server needs the mutationId to dedupe retries
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      mutationId: 'm1', operation: 'create', collection: 'products', recordId: UUID, baseRevision: null, payload: mut().payload,
    });
    expect(events.map((e) => e.type)).toEqual(['push.outcome']);
    expect(events[0].fields).toMatchObject({ op: 'create', outcome: 'created', recordId: UUID });
  });

  it('updates: outcome updated', async () => {
    const result = await pushRecordMutation({ mutation: mut({ operation: 'update' }), resolveEndpoint, fetcher: async () => jsonResponse(200, { id: 1 }) });
    expect(result.outcome).toBe('updated');
  });

  it('deletes: sends the envelope without a payload and returns a null document', async () => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse(200, {}));
    const result = await pushRecordMutation({ mutation: mut({ operation: 'delete' }), resolveEndpoint, fetcher });
    expect(result.outcome).toBe('deleted');
    expect(result.document).toBeNull();
    const body = JSON.parse((fetcher.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ mutationId: 'm1', operation: 'delete', collection: 'products', recordId: UUID, baseRevision: null });
    expect(body.payload).toBeUndefined(); // a delete carries no payload
  });

  it('parses the { document, currentRevision } envelope into document + currentRevision', async () => {
    const result = await pushRecordMutation({
      mutation: mut(),
      resolveEndpoint,
      fetcher: async () => jsonResponse(201, { document: { id: 9, meta_data: [{ key: RECORD_UUID_META_KEY, value: UUID }] }, currentRevision: 'sha256:abc' }),
    });
    expect(result.document).toEqual({ id: 9, meta_data: [{ key: RECORD_UUID_META_KEY, value: UUID }] });
    expect(result.currentRevision).toBe('sha256:abc'); // stored as the next update's baseRevision
  });

  it('accepts a bare record (no envelope) for back-compat, with a null revision', async () => {
    const result = await pushRecordMutation({ mutation: mut(), resolveEndpoint, fetcher: async () => jsonResponse(201, { id: 1, meta_data: [] }) });
    expect(result.document).toEqual({ id: 1, meta_data: [] });
    expect(result.currentRevision).toBeNull();
  });

  it('does NOT mis-unwrap a bare record that carries its own top-level document field', async () => {
    const bare = { id: 2, document: 'a real woo field, not an envelope', meta_data: [] };
    const result = await pushRecordMutation({ mutation: mut(), resolveEndpoint, fetcher: async () => jsonResponse(201, bare) });
    expect(result.document).toEqual(bare); // taken as-is (no currentRevision ⇒ not an envelope)
    expect(result.currentRevision).toBeNull();
  });

  it('unwraps an enveloped success response via extractDocument', async () => {
    const result = await pushRecordMutation({
      mutation: mut(),
      resolveEndpoint,
      fetcher: async () => jsonResponse(201, { document: { id: 5, meta_data: [{ key: RECORD_UUID_META_KEY, value: UUID }] } }),
      extractDocument: (body) => (body.document as Record<string, unknown>) ?? null,
    });
    expect(result.document).toEqual({ id: 5, meta_data: [{ key: RECORD_UUID_META_KEY, value: UUID }] });
  });

  it('409: returns a conflict outcome with the server current state, emits push.conflict (warn), does NOT throw', async () => {
    const events: SyncEvent[] = [];
    const result = await pushRecordMutation({
      mutation: mut({ operation: 'update' }),
      resolveEndpoint,
      fetcher: async () => jsonResponse(409, { current: { id: 9, status: 'completed' }, currentRevision: 'rev-9' }),
      observe: (e) => events.push(e),
    });
    expect(result.outcome).toBe('conflict');
    expect(result.conflict).toEqual({ current: { id: 9, status: 'completed' }, currentRevision: 'rev-9' });
    expect(events[0].type).toBe('push.conflict');
    expect(events[0].level).toBe('warn');
  });

  it('treats a 409 in_progress (atomic-reserve contention) as a retryable error, not a conflict', async () => {
    const events: SyncEvent[] = [];
    await expect(
      pushRecordMutation({
        mutation: mut({ operation: 'update' }),
        resolveEndpoint,
        fetcher: async () => jsonResponse(409, { code: 'woo_rxdb_sync_in_progress', message: 'retry' }),
        observe: (e) => events.push(e),
      }),
    ).rejects.toMatchObject({ name: 'RecordPushError', reason: 'in-progress', status: 409 });
    expect(events[0].type).toBe('push.in_progress');
  });

  it('treats a 409 record_locked (per-record CAS lock held) as a retryable error, not a conflict', async () => {
    const events: SyncEvent[] = [];
    await expect(
      pushRecordMutation({
        mutation: mut({ operation: 'update' }),
        resolveEndpoint,
        fetcher: async () => jsonResponse(409, { code: 'woo_rxdb_sync_record_locked', message: 'retry shortly' }),
        observe: (e) => events.push(e),
      }),
    ).rejects.toMatchObject({ name: 'RecordPushError', reason: 'record-locked', status: 409 });
    expect(events[0].type).toBe('push.in_progress'); // transient, not push.conflict
  });

  it('treats a 409 identity_ambiguous (F4a fail-closed) as a PERMANENT error — not a conflict, not transient', async () => {
    const events: SyncEvent[] = [];
    // The real body is a WP_Error serialization ({ code, message, data.status }) — no `current` to rebase on.
    await expect(
      pushRecordMutation({
        mutation: mut({ operation: 'update' }),
        resolveEndpoint,
        fetcher: async () => jsonResponse(409, {
          code: 'woo_rxdb_sync_identity_ambiguous',
          message: `uuid ${UUID} resolves to more than one post record; refusing to write to an arbitrary match.`,
          data: { status: 409 },
        }),
        observe: (e) => events.push(e),
      }),
    ).rejects.toMatchObject({ name: 'RecordPushError', reason: 'identity-ambiguous', status: 409, permanent: true });
    // surfaced as an ERROR (the host must see it), not push.conflict / push.in_progress
    expect(events.map((e) => e.type)).toEqual(['push.error']);
    expect(events[0]).toMatchObject({ level: 'error', fields: { status: 409, reason: 'identity-ambiguous' } });
  });

  it('keeps the transient 409s non-permanent so only identity_ambiguous is dead-lettered', async () => {
    await expect(
      pushRecordMutation({
        mutation: mut({ operation: 'update' }),
        resolveEndpoint,
        fetcher: async () => jsonResponse(409, { code: 'woo_rxdb_sync_in_progress' }),
      }),
    ).rejects.toMatchObject({ permanent: false });
  });

  it('non-ok: throws RecordPushError carrying the status, emits push.error', async () => {
    const events: SyncEvent[] = [];
    await expect(
      pushRecordMutation({ mutation: mut(), resolveEndpoint, fetcher: async () => jsonResponse(500, {}), observe: (e) => events.push(e) }),
    ).rejects.toBeInstanceOf(RecordPushError);
    expect(events[0]).toMatchObject({ type: 'push.error', level: 'error', fields: { status: 500 } });
  });

  it('threads an abort signal into the request init', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse(201, {}));
    await pushRecordMutation({ mutation: mut(), resolveEndpoint, fetcher, signal: controller.signal });
    expect((fetcher.mock.calls[0][1] as RequestInit).signal).toBe(controller.signal);
  });

  it('mirrors the canonical body into standard headers — Idempotency-Key always, If-Match only with a base revision (ADR 0011)', async () => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse(200, { id: 4242, meta_data: [{ key: RECORD_UUID_META_KEY, value: UUID }] }));

    // update carrying a base revision → Idempotency-Key + quoted If-Match entity-tag
    await pushRecordMutation({ mutation: mut({ operation: 'update', baseRevision: 'rev-1' }), resolveEndpoint, fetcher });
    let headers = (fetcher.mock.calls.at(-1)![1] as RequestInit).headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBe('m1');
    expect(headers['If-Match']).toBe('"rev-1"');

    // create (no base revision) → key only, no If-Match (nothing to condition on)
    await pushRecordMutation({ mutation: mut(), resolveEndpoint, fetcher });
    headers = (fetcher.mock.calls.at(-1)![1] as RequestInit).headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBe('m1');
    expect(headers['If-Match']).toBeUndefined();

    // durable-restored entry with an UNDEFINED base revision (optional in the queue schema) → still no
    // If-Match. Must not send `If-Match: "undefined"` (which JSON.stringify drops from the body → server 422).
    await pushRecordMutation({ mutation: { ...mut(), baseRevision: undefined as unknown as null }, resolveEndpoint, fetcher });
    headers = (fetcher.mock.calls.at(-1)![1] as RequestInit).headers as Record<string, string>;
    expect(headers['If-Match']).toBeUndefined();
  });

  it('emits push.error and rethrows when the fetch itself rejects (network failure)', async () => {
    const events: SyncEvent[] = [];
    await expect(
      pushRecordMutation({ mutation: mut(), resolveEndpoint, fetcher: async () => { throw new TypeError('Failed to fetch'); }, observe: (e) => events.push(e) }),
    ).rejects.toThrow('Failed to fetch');
    expect(events[0]).toMatchObject({ type: 'push.error', level: 'error', fields: { reason: 'TypeError' } });
  });

  it('emits push.aborted (warn) and rethrows when the fetch is aborted', async () => {
    const events: SyncEvent[] = [];
    const controller = new AbortController();
    controller.abort();
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
    await expect(
      pushRecordMutation({ mutation: mut(), resolveEndpoint, fetcher: async () => { throw abortErr; }, signal: controller.signal, observe: (e) => events.push(e) }),
    ).rejects.toThrow('aborted');
    expect(events[0]).toMatchObject({ type: 'push.aborted', level: 'warn' });
  });

  it('fails fast when a create 2xx returns no parseable document (can\'t reconcile)', async () => {
    const events: SyncEvent[] = [];
    const noBody = { status: 201, ok: true, json: async () => { throw new SyntaxError('Unexpected end of JSON'); } } as unknown as Response;
    await expect(
      pushRecordMutation({ mutation: mut(), resolveEndpoint, fetcher: async () => noBody, observe: (e) => events.push(e) }),
    ).rejects.toMatchObject({ name: 'RecordPushError', reason: 'no-document' });
    expect(events[0]).toMatchObject({ type: 'push.error', fields: { reason: 'no-document' } });
  });

  it('a throwing extractDocument emits push.error and fails fast (no silent successful push)', async () => {
    const events: SyncEvent[] = [];
    await expect(
      pushRecordMutation({
        mutation: mut(),
        resolveEndpoint,
        fetcher: async () => jsonResponse(201, { id: 1 }),
        extractDocument: () => { throw new Error('bad shape'); },
        observe: (e) => events.push(e),
      }),
    ).rejects.toMatchObject({ name: 'RecordPushError', reason: 'extract-failed' });
    expect(events[0]).toMatchObject({ type: 'push.error', fields: { reason: 'extract-failed' } });
  });

  it('a throwing observer never breaks the push (best-effort telemetry)', async () => {
    const result = await pushRecordMutation({
      mutation: mut(),
      resolveEndpoint,
      fetcher: async () => jsonResponse(201, { id: 1 }),
      observe: () => { throw new Error('sink down'); },
    });
    expect(result.outcome).toBe('created');
  });
});

describe('pushEndpointResolver', () => {
  it('routes each mutation to {base}/wc-rxdb-sync/v1/push/{collection} via POST', () => {
    const resolve = pushEndpointResolver('https://shop.example/wp-json/');
    expect(resolve(mut({ collectionName: 'customers' }))).toEqual({ url: 'https://shop.example/wp-json/wc-rxdb-sync/v1/push/customers', method: 'POST' });
    expect(resolve(mut({ collectionName: 'products' })).url).toBe('https://shop.example/wp-json/wc-rxdb-sync/v1/push/products');
  });
});

describe('reconcileCreateAck', () => {
  it('keeps the recordId and returns the server-assigned remote id when the server reused our uuid', () => {
    const r = reconcileCreateAck(mut(), { id: 4242, meta_data: [{ key: RECORD_UUID_META_KEY, value: UUID }] });
    expect(r).toEqual({ recordId: UUID, remoteId: 4242 });
  });

  it('tolerates a server document without meta_data (remoteId from id)', () => {
    expect(reconcileCreateAck(mut(), { id: 7 })).toEqual({ recordId: UUID, remoteId: 7 });
  });

  it('throws if the server came back with a DIFFERENT uuid (never re-key)', () => {
    expect(() =>
      reconcileCreateAck(mut(), { id: 1, meta_data: [{ key: RECORD_UUID_META_KEY, value: '00000000-0000-4000-8000-000000000099' }] }),
    ).toThrow(/never be re-keyed/);
  });
});
