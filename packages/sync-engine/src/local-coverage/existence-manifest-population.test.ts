// @vitest-environment node
import { describe, expect, it } from 'vitest';

import type { OrderDocument } from '@wcpos/sync-core';

import {
	materializeLocalOnly,
	materializeTargeted,
} from '../materialization/record-materialization';
import { manifestRowsForApplied, stripOrderManifestDigest } from './existence-manifest-population';

const posUuid = (n: number) => [
	{
		key: '_woocommerce_pos_uuid',
		value: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
	},
];

describe('manifestRowsForApplied', () => {
	it('returns the rows of the applied documents only, in materialization order', () => {
		const materialized = [30, 31, 32].map((id) =>
			materializeTargeted('customers', {
				id,
				meta_data: posUuid(id),
				...(id === 31 ? {} : { _rxdb_digest: `d${id}` }),
			})
		);
		// 32 was dropped by an apply guard; 31 carries no server digest at all.
		const applied = [materialized[0]!.storedDocument, materialized[1]!.storedDocument] as {
			uuid: string;
		}[];

		expect(manifestRowsForApplied(materialized, applied)).toEqual([
			{ remoteId: '30', wooId: 30, objectType: 'customer', digest: 'd30' },
		]);
	});

	it('records nothing when every document was filtered out', () => {
		const materialized = [
			materializeLocalOnly({
				id: 77,
				meta_data: posUuid(77),
				_rxdb_digest: 'd77',
			} as never),
		];
		// The pending-mutation guard skipped the only pulled order: its resident copy is the
		// dirty one, so the server's digest must NOT be recorded as locally held.
		expect(manifestRowsForApplied(materialized, [])).toEqual([]);
	});
});

describe('stripOrderManifestDigest', () => {
	it('removes a transport-only digest without touching the rest of the payload', () => {
		const document = {
			uuid: 'uuid-77',
			remoteId: '77',
			payload: { id: 77, status: 'processing', _rxdb_digest: 'd77' },
			sync: { revision: 'r', partial: false, source: 'woo-rest' },
			local: { dirty: false, pendingMutationIds: [] },
		} as unknown as OrderDocument;

		const stripped = stripOrderManifestDigest(document);

		expect(stripped.payload).toEqual({ id: 77, status: 'processing' });
		expect(document.payload).toHaveProperty('_rxdb_digest'); // pure — the input is untouched
	});

	it('returns the same document when there is no digest to strip', () => {
		const document = { payload: { id: 78 } } as unknown as OrderDocument;
		expect(stripOrderManifestDigest(document)).toBe(document);
	});
});
