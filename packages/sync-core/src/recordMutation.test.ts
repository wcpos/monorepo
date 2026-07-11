import { describe, expect, it } from 'vitest';
import { RECORD_UUID_META_KEY } from '@woo-rxdb-lab/shared';
import {
  buildCreateMutation,
  buildDeleteMutation,
  buildUpdateMutation,
  isAwaitingRemoteCreate,
} from './recordMutation';

const UUID_A = '5b8e1a3c-2f4d-4a6b-9c8e-1d2f3a4b5c6d';

/** A deterministic mint: u1, u2, … so we can assert which uuid landed where. */
function counterDeps() {
  let n = 0;
  return { mintUuid: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, now: () => '2026-06-26T00:00:00.000Z' };
}

const uuidOf = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const metaUuid = (m: RecordMutationPayload) => m.find((e) => e.key === RECORD_UUID_META_KEY)?.value;
type RecordMutationPayload = Array<{ key: string; value: unknown }>;

describe('buildCreateMutation', () => {
  it('mints a born-local recordId, mirrors it into meta_data, and uses a SEPARATE mutationId', () => {
    const m = buildCreateMutation({ collectionName: 'products', payload: { name: 'Widget' } }, counterDeps());
    expect(m.collectionName).toBe('products');
    expect(m.operation).toBe('create');
    expect(m.origin).toBe('minted');
    expect(m.recordId).toBe(uuidOf(1)); // first mint = the record id
    expect(m.mutationId).toBe(uuidOf(2)); // second mint = the idempotency key (distinct!)
    expect(m.mutationId).not.toBe(m.recordId);
    expect(metaUuid(m.payload.meta_data as RecordMutationPayload)).toBe(m.recordId);
    expect(m.baseRevision).toBeNull();
    expect(m.queuedAt).toBe('2026-06-26T00:00:00.000Z');
    expect(isAwaitingRemoteCreate(m)).toBe(true);
  });

  it('does NOT adopt a copied _woocommerce_pos_uuid — a clone mints a fresh id and overwrites the copy', () => {
    const m = buildCreateMutation(
      { collectionName: 'orders', payload: { total: '9.99', meta_data: [{ key: RECORD_UUID_META_KEY, value: UUID_A }] } },
      counterDeps(),
    );
    expect(m.recordId).toBe(uuidOf(1)); // minted fresh — NOT the copied UUID_A
    expect(m.recordId).not.toBe(UUID_A);
    expect(m.origin).toBe('minted');
    expect(metaUuid(m.payload.meta_data as RecordMutationPayload)).toBe(m.recordId); // the copied uuid is overwritten
    expect(isAwaitingRemoteCreate(m)).toBe(true);
  });

  it('honors an explicit currentId (existing origin) and still awaits the server ack', () => {
    const m = buildCreateMutation({ collectionName: 'customers', payload: { email: 'a@b.c' }, currentId: UUID_A }, counterDeps());
    expect(m.recordId).toBe(UUID_A);
    expect(m.origin).toBe('existing');
    expect(metaUuid(m.payload.meta_data as RecordMutationPayload)).toBe(UUID_A);
    expect(isAwaitingRemoteCreate(m)).toBe(true); // a create awaits regardless of id origin
  });
});

describe('buildUpdateMutation', () => {
  it('keeps the fixed recordId, mirrors it into a sparse payload, and carries baseRevision', () => {
    const m = buildUpdateMutation(
      { collectionName: 'products', recordId: UUID_A, payload: { regular_price: '5.00' }, baseRevision: 'rev-7' },
      counterDeps(),
    );
    expect(m.operation).toBe('update');
    expect(m.recordId).toBe(UUID_A);
    expect(m.origin).toBe('existing');
    expect(metaUuid(m.payload.meta_data as RecordMutationPayload)).toBe(UUID_A);
    expect(m.baseRevision).toBe('rev-7');
    expect(isAwaitingRemoteCreate(m)).toBe(false);
  });

  it('throws when the payload carries a uuid that disagrees with recordId (never re-keys)', () => {
    expect(() =>
      buildUpdateMutation(
        { collectionName: 'orders', recordId: UUID_A, payload: { meta_data: [{ key: RECORD_UUID_META_KEY, value: uuidOf(99) }] }, baseRevision: null },
        counterDeps(),
      ),
    ).toThrow(/identity conflict/);
  });
});

describe('buildDeleteMutation', () => {
  it('targets an existing record by uuid and carries the required baseRevision precondition', () => {
    const m = buildDeleteMutation({ collectionName: 'tax_rates', recordId: UUID_A, baseRevision: 'sha256:rev-A' }, counterDeps());
    expect(m.operation).toBe('delete');
    expect(m.recordId).toBe(UUID_A);
    expect(m.origin).toBe('existing');
    expect(m.payload).toEqual({ id: UUID_A });
    // The server refuses an unconditional delete of an existing record (428); the
    // precondition must travel with the mutation so the drain doesn't dead-letter it.
    expect(m.baseRevision).toBe('sha256:rev-A');
  });
});
