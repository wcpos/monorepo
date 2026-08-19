// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';

import type { OrderDocument } from '@wcpos/sync-core';
import type { LocalCustomerDocument } from '@wcpos/sync-engine/testing';

import {
	materializeLocalOnly,
	materializeTargeted,
} from '../materialization/record-materialization';
import { remoteId } from '../testing';
import {
	extractCustomerManifest,
	extractOrderManifest,
	withCustomerManifestPopulation,
} from './existence-manifest-population';

function customerDoc(
	payload: Record<string, unknown>,
	wooCustomerId: number | null = 30
): LocalCustomerDocument {
	return {
		uuid: `uuid-${wooCustomerId}`,
		remoteId: wooCustomerId === null ? null : remoteId(wooCustomerId),
		payload: payload as LocalCustomerDocument['payload'],
		sync: { revision: 'r', partial: false, source: 'woo-rest' },
		local: { dirty: false, pendingMutationIds: [] },
	} as LocalCustomerDocument;
}

describe('extractCustomerManifest', () => {
	it('builds a customer manifest row (objectType customer) from _rxdb_digest and strips it', () => {
		const { manifestRows, documents } = extractCustomerManifest([
			customerDoc({ id: 30, _rxdb_digest: '9223372036854775810' }, 30),
			customerDoc({ id: 31 }, 31), // no digest
			customerDoc({ id: 0, _rxdb_digest: 'x' }, null), // born-local (no wooId) → no row
		]);
		expect(manifestRows).toEqual([
			{
				remoteId: '30',
				wooId: 30,
				objectType: 'customer',
				digest: '9223372036854775810',
			},
		]);
		expect(documents.every((d) => !('_rxdb_digest' in (d.payload as object)))).toBe(true);
	});
});

describe('Symbol-borne manifest rows (#1345 mechanism 1)', () => {
	// materializeTargeted/materializeLocalOnly strip `_rxdb_digest` from the payload at
	// materialization time; from there the manifest row travels ONLY on a non-enumerable
	// Symbol (#1340). extract*Manifest must read that Symbol BEFORE stripping — strip*
	// rebuilds the document with a spread, which drops the Symbol. These tests fail if
	// the read/strip order in extract*Manifest is ever swapped.
	const posUuid = (n: number) => [
		{
			key: '_woocommerce_pos_uuid',
			value: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
		},
	];

	it('extractCustomerManifest recovers a row that rides only the Symbol', () => {
		const { storedDocument } = materializeTargeted('customers', {
			id: 30,
			meta_data: posUuid(30),
			_rxdb_digest: 'd30',
		});
		// The payload carrier is already gone — the Symbol is the row's only vehicle.
		expect('_rxdb_digest' in (storedDocument.payload as object)).toBe(false);
		const { manifestRows, documents } = extractCustomerManifest([
			storedDocument as unknown as LocalCustomerDocument,
		]);
		expect(manifestRows).toEqual([
			{ remoteId: '30', wooId: 30, objectType: 'customer', digest: 'd30' },
		]);
		expect(documents).toHaveLength(1);
	});

	it('extractOrderManifest recovers a row that rides only the Symbol', () => {
		const { storedDocument } = materializeLocalOnly({
			id: 77,
			meta_data: posUuid(77),
			_rxdb_digest: 'd77',
		} as never);
		expect('_rxdb_digest' in (storedDocument.payload as object)).toBe(false);
		const { manifestRows, documents } = extractOrderManifest([storedDocument]);
		expect(manifestRows).toEqual([
			{ remoteId: '77', wooId: 77, objectType: 'order', digest: 'd77' },
		]);
		expect(documents).toHaveLength(1);
	});
});

describe('withCustomerManifestPopulation', () => {
	it('on upsert: stores stripped docs via the base repo, then seeds the customer manifest', async () => {
		const baseUpsert = vi.fn(async (_docs: LocalCustomerDocument[]) => undefined);
		const bulkUpsert = vi.fn(async () => undefined);
		const repo = withCustomerManifestPopulation({ upsertMany: baseUpsert }, {
			bulkUpsert,
			bulkRemove: vi.fn(),
			find: vi.fn(),
		} as never);

		await repo.upsertMany([customerDoc({ id: 30, name: 'A', _rxdb_digest: 'd30' }, 30)]);

		// Base stores the cleaned doc (no _rxdb_digest).
		const stored = (baseUpsert.mock.calls[0] as unknown as [LocalCustomerDocument[]])[0][0];
		expect('_rxdb_digest' in (stored.payload as object)).toBe(false);
		// Manifest seeded with the customer row.
		expect(bulkUpsert).toHaveBeenCalledWith([
			{ remoteId: '30', wooId: 30, objectType: 'customer', digest: 'd30' },
		]);
	});

	it('does not touch the manifest when no customer carries a digest', async () => {
		const bulkUpsert = vi.fn(async () => undefined);
		const repo = withCustomerManifestPopulation(
			{
				upsertMany: vi.fn(async (_docs: LocalCustomerDocument[]) => undefined),
			},
			{ bulkUpsert, bulkRemove: vi.fn(), find: vi.fn() } as never
		);
		await repo.upsertMany([customerDoc({ id: 30 }, 30)]);
		expect(bulkUpsert).not.toHaveBeenCalled();
	});
});

describe('extractOrderManifest', () => {
	const orderDoc = (wooOrderId: number | null, payload: Record<string, unknown>): OrderDocument =>
		({
			uuid: `uuid-${wooOrderId}`,
			remoteId: wooOrderId === null ? null : remoteId(wooOrderId),
			payload,
			sync: { revision: 'r', partial: false, source: 'woo-rest' },
			local: { dirty: false, pendingMutationIds: [] },
		}) as unknown as OrderDocument;

	it('builds an order manifest row (objectType order) from _rxdb_digest and strips it', () => {
		const { manifestRows, documents } = extractOrderManifest([
			orderDoc(77, { id: 77, _rxdb_digest: '9223372036854775810' }),
			orderDoc(78, { id: 78 }), // no digest
			orderDoc(null, { id: 0, _rxdb_digest: 'x' }), // born-local (no wooOrderId)
		]);
		expect(manifestRows).toEqual([
			{
				remoteId: '77',
				wooId: 77,
				objectType: 'order',
				digest: '9223372036854775810',
			},
		]);
		expect(documents.every((d) => !('_rxdb_digest' in (d.payload as object)))).toBe(true);
	});
});
