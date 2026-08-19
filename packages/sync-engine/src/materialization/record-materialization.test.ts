import { describe, expect, it } from 'vitest';

import { remoteId } from '../testing';
import {
	materializeGreedyPrunable,
	materializeLocalOnly,
	materializeTargeted,
	materializeUpsertRefresh,
} from './record-materialization';

const uuid = '00000000-0000-4000-8000-000000000007';
const meta_data = [{ key: '_woocommerce_pos_uuid', value: uuid }];

describe('record materialization seam', () => {
	it.each([
		['sku', { sku: '  SKU-7  ' }, 'SKU-7'],
		['global_unique_id', { global_unique_id: '  GTIN-7  ' }, 'GTIN-7'],
		[
			'meta_data:_barcode',
			{ meta_data: [...meta_data, { key: '_barcode', value: '  CUSTOM-7  ' }] },
			'CUSTOM-7',
		],
	] as const)(
		'materializes the active %s carrier as payload.barcode',
		(selector, carrier, barcode) => {
			const stored = materializeTargeted(
				'products',
				{
					id: 7,
					date_modified_gmt: 'legacy',
					...carrier,
					...(selector.startsWith('meta_data:') ? {} : { meta_data }),
				},
				[selector]
			).storedDocument;

			expect(stored.payload).toMatchObject({ barcode });
		}
	);

	it('does not clobber a previously materialized barcode when no selectors are reported', () => {
		const stored = materializeTargeted('products', {
			id: 7,
			barcode: 'KEEP-ME',
			date_modified_gmt: 'legacy',
			meta_data,
		}).storedDocument;

		expect(stored.payload).toMatchObject({ barcode: 'KEEP-ME' });
	});

	it('owns stamped revision adoption, legacy fallback, identity, digest routing, and promoted product fields', () => {
		const stamped = materializeTargeted('products', {
			id: 7,
			name: 'Hat',
			price: '12.34',
			status: 'publish',
			date_modified_gmt: 'legacy',
			meta_data,
			_rxdb_revision: 'server-r',
			_rxdb_digest: 'digest-7',
		});
		expect(stamped.storedDocument).toMatchObject({
			uuid: uuid,
			remoteId: remoteId(7),
			price: 12.34,
			sync: { revision: 'server-r' },
		});
		expect(stamped.storedDocument.payload).not.toHaveProperty('_rxdb_revision');
		expect(stamped.storedDocument.payload).not.toHaveProperty('_rxdb_digest');
		expect(stamped.manifestRow).toMatchObject({
			wooId: 7,
			objectType: 'product',
			digest: 'digest-7',
		});
		// The envelope is the row's ONLY carrier (ADR 0028 rider): nothing is stamped onto the
		// stored document, so a spread anywhere downstream cannot silently drop it (#1340).
		expect(Object.getOwnPropertySymbols(stamped.storedDocument)).toEqual([]);
		expect(
			materializeTargeted('products', { id: 7, date_modified_gmt: 'legacy', meta_data })
				.storedDocument
		).toMatchObject({ sync: { revision: 'legacy' } });
	});

	it('projects every descriptor shape without minting a missing uuid', () => {
		expect(() => materializeTargeted('customers', { id: 7 })).toThrow();
		expect(
			materializeTargeted('variations', { id: 7, parent_id: 3, attributes: [], meta_data })
				.storedDocument
		).toMatchObject({
			uuid,
			remoteId: remoteId(7),
			parentRemoteId: remoteId(3),
			attributes: [],
			local: { dirty: false, pendingMutationIds: [] },
		});
		expect(
			materializeGreedyPrunable({ id: 7, name: 'Term', meta_data }).storedDocument
		).toMatchObject({
			uuid,
			remoteId: remoteId(7),
			local: { dirty: false, pendingMutationIds: [] },
		});
		expect(materializeUpsertRefresh({ id: 7 } as never).storedDocument).toMatchObject({
			uuid: 'woo-tax-rate:7',
			remoteId: remoteId(7),
		});
		expect(
			materializeLocalOnly({ id: 7, status: 'processing', meta_data } as never).storedDocument
		).toMatchObject({ uuid: uuid, remoteId: remoteId(7), payload: { status: 'processing' } });
	});

	it('strips object order meta display fields while preserving typed values and strings', () => {
		const stored = materializeLocalOnly({
			id: 7,
			meta_data,
			line_items: [
				{
					meta_data: [
						{
							key: '_woocommerce_pos_data',
							value: { price: '45' },
							display_value: { price: '45' },
						},
						{
							key: 'Size',
							value: 'L',
							display_key: 'Size',
							display_value: 'L',
						},
					],
				},
			],
		} as never).storedDocument;

		expect(stored.payload.line_items).toEqual([
			{
				meta_data: [
					{ key: '_woocommerce_pos_data', value: { price: '45' } },
					{ key: 'Size', value: 'L', display_key: 'Size', display_value: 'L' },
				],
			},
		]);
	});

	it('is the only production module importing revision adoption (drift guard)', () => {
		const sources = (
			import.meta as ImportMeta & {
				glob: (pattern: string, options: Record<string, unknown>) => Record<string, string>;
			}
		).glob('./*.ts', { eager: true, query: '?raw', import: 'default' });
		const importers = Object.entries(sources).filter(
			([name, source]) =>
				!name.endsWith('.test.ts') && source.includes("from '../write-path/adopt-stamped-revision'")
		);
		expect(importers.map(([name]) => name)).toEqual(['./record-materialization.ts']);
	});
});
