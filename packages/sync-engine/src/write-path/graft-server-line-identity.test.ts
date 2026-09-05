/**
 * #818 unit contract for the ack identity graft: server ids in, nothing else —
 * and never on an ambiguous match.
 */

import { describe, expect, it } from 'vitest';

import { graftServerLineIdentity } from './graft-server-line-identity';

const uuidMeta = (value: string) => [{ key: '_woocommerce_pos_uuid', value }];

describe('graftServerLineIdentity', () => {
	it.each([{ line_items: [] }, { line_items: [{ id: 12, product_id: 2 }] }])(
		'reconciles deleted identities only against a materializable full array: %j',
		({ line_items }) => {
			const payload = {
				line_items: [
					{ id: 11, product_id: null },
					{ id: 10, product_id: 1, quantity: 3 },
					{ id: 12, product_id: 2 },
				],
			};
			const document = {
				id: 900,
				meta_data: uuidMeta('22222222-2222-4222-8222-222222222222'),
				line_items,
			};
			const outbound = graftServerLineIdentity(payload, document);
			expect(outbound.line_items).toEqual([
				{ product_id: 1, quantity: 3 },
				line_items.length ? { id: 12, product_id: 2 } : { product_id: 2 },
			]);
			expect(
				outbound.line_items.every(
					(line) => !line.id || line_items.some((server) => server.id === line.id)
				)
			).toBe(true);
			expect(payload.line_items[0]).toEqual({ id: 11, product_id: null });
		}
	);

	it('grafts the server id onto the uuid-matched line and keeps every local value', () => {
		const payload = {
			total: '52.00',
			line_items: [
				{
					product_id: 1,
					quantity: 3,
					total: '52.00',
					meta_data: uuidMeta('a'),
				},
			],
		};
		const grafted = graftServerLineIdentity(payload, {
			total: '999.00',
			line_items: [
				{
					id: 71,
					product_id: 1,
					quantity: 1,
					total: '999.00',
					meta_data: uuidMeta('a'),
				},
			],
		});

		expect(grafted).toEqual({
			total: '52.00',
			line_items: [
				{
					id: 71,
					product_id: 1,
					quantity: 3,
					total: '52.00',
					meta_data: uuidMeta('a'),
				},
			],
		});
	});

	it('matches by uuid, NOT by position', () => {
		const payload = {
			line_items: [
				{ product_id: 1, meta_data: uuidMeta('b') },
				{ product_id: 2, meta_data: uuidMeta('a') },
			],
		};
		const grafted = graftServerLineIdentity(payload, {
			line_items: [
				{ id: 10, product_id: 2, meta_data: uuidMeta('a') },
				{ id: 11, product_id: 1, meta_data: uuidMeta('b') },
			],
		});

		expect(grafted.line_items).toEqual([
			{ id: 11, product_id: 1, meta_data: uuidMeta('b') },
			{ id: 10, product_id: 2, meta_data: uuidMeta('a') },
		]);
	});

	it('covers fee, shipping and coupon lines — every array Woo appends to', () => {
		const payload = {
			fee_lines: [{ name: 'Fee', meta_data: uuidMeta('f') }],
			shipping_lines: [{ method_id: 'flat_rate', meta_data: uuidMeta('s') }],
			coupon_lines: [{ code: 'X', meta_data: uuidMeta('c') }],
		};
		const grafted = graftServerLineIdentity(payload, {
			fee_lines: [{ id: 1, meta_data: uuidMeta('f') }],
			shipping_lines: [{ id: 2, meta_data: uuidMeta('s') }],
			coupon_lines: [{ id: 3, meta_data: uuidMeta('c') }],
		});

		expect(grafted).toEqual({
			fee_lines: [{ id: 1, name: 'Fee', meta_data: uuidMeta('f') }],
			shipping_lines: [{ id: 2, method_id: 'flat_rate', meta_data: uuidMeta('s') }],
			coupon_lines: [{ id: 3, code: 'X', meta_data: uuidMeta('c') }],
		});
	});

	it('leaves tax_lines alone — Woo recalculates them; the write path never posts them', () => {
		const payload = { tax_lines: [{ rate_id: 9, meta_data: uuidMeta('t') }] };
		const grafted = graftServerLineIdentity(payload, {
			tax_lines: [{ id: 5, rate_id: 9, meta_data: uuidMeta('t') }],
		});

		expect(grafted).toBe(payload);
	});

	it('returns the SAME reference when nothing can be grafted', () => {
		const payload = {
			line_items: [{ product_id: 1, meta_data: uuidMeta('a') }],
		};
		// no server document, no server lines, and a server line without an id
		expect(graftServerLineIdentity(payload, null)).toBe(payload);
		expect(graftServerLineIdentity(payload, { line_items: [] })).toBe(payload);
		expect(
			graftServerLineIdentity(payload, {
				line_items: [{ meta_data: uuidMeta('a') }],
			})
		).toBe(payload);
		// a line with no uuid meta is never matched (no positional fallback)
		expect(
			graftServerLineIdentity(
				{ line_items: [{ product_id: 1 }] },
				{ line_items: [{ id: 71, product_id: 1 }] }
			).line_items
		).toEqual([{ product_id: 1 }]);
	});

	it('never overwrites a line that already carries a server id', () => {
		const payload = {
			line_items: [{ id: 7, product_id: 1, meta_data: uuidMeta('a') }],
		};
		const grafted = graftServerLineIdentity(payload, {
			line_items: [{ id: 99, product_id: 1, meta_data: uuidMeta('a') }],
		});

		expect(grafted).toBe(payload);
	});

	it('refuses an AMBIGUOUS uuid on either side — a wrong id would rewrite the wrong line', () => {
		const duplicatedLocally = {
			line_items: [
				{ product_id: 1, meta_data: uuidMeta('a') },
				{ product_id: 2, meta_data: uuidMeta('a') },
			],
		};
		expect(
			graftServerLineIdentity(duplicatedLocally, {
				line_items: [{ id: 10, meta_data: uuidMeta('a') }],
			})
		).toBe(duplicatedLocally);

		const duplicatedOnServer = {
			line_items: [{ product_id: 1, meta_data: uuidMeta('a') }],
		};
		expect(
			graftServerLineIdentity(duplicatedOnServer, {
				line_items: [
					{ id: 10, meta_data: uuidMeta('a') },
					{ id: 11, meta_data: uuidMeta('a') },
				],
			})
		).toBe(duplicatedOnServer);
	});

	it('refuses a local line carrying two DIFFERENT uuid metas rather than picking the first', () => {
		const payload = {
			line_items: [
				{
					product_id: 1,
					meta_data: [...uuidMeta('a'), ...uuidMeta('b')],
				},
			],
		};
		expect(
			graftServerLineIdentity(payload, { line_items: [{ id: 10, meta_data: uuidMeta('a') }] })
		).toBe(payload);
	});

	it('counts every uuid claimed by a conflicting line when deciding ambiguity', () => {
		const conflictedMeta = [...uuidMeta('a'), ...uuidMeta('b')];
		const conflictedLocally = {
			line_items: [
				{ product_id: 1, meta_data: conflictedMeta },
				{ product_id: 2, meta_data: uuidMeta('a') },
			],
		};
		expect(
			graftServerLineIdentity(conflictedLocally, {
				line_items: [{ id: 10, meta_data: uuidMeta('a') }],
			})
		).toBe(conflictedLocally);

		const conflictedOnServer = {
			line_items: [{ product_id: 1, meta_data: uuidMeta('a') }],
		};
		expect(
			graftServerLineIdentity(conflictedOnServer, {
				line_items: [
					{ id: 10, meta_data: conflictedMeta },
					{ id: 11, meta_data: uuidMeta('a') },
				],
			})
		).toBe(conflictedOnServer);
	});

	it('counts server OCCURRENCES, not usable ids, when deciding ambiguity', () => {
		// Two server lines share uuid 'a' and only one carries an id. The client
		// cannot tell which of the two it authored, so neither may be grafted.
		const payload = { line_items: [{ product_id: 1, meta_data: uuidMeta('a') }] };
		expect(
			graftServerLineIdentity(payload, {
				line_items: [{ meta_data: uuidMeta('a') }, { id: 10, meta_data: uuidMeta('a') }],
			})
		).toBe(payload);
	});

	it.each([true, [7], 7.5])('rejects a non-integer server id (%j)', (id) => {
		const payload = { line_items: [{ product_id: 1, meta_data: uuidMeta('a') }] };

		expect(
			graftServerLineIdentity(payload, {
				line_items: [{ id, meta_data: uuidMeta('a') }],
			})
		).toBe(payload);
	});

	it('tolerates a SPARSE ack document without destroying resident lines', () => {
		// Observed in the wild: a bare create ack carrying `total: "0.00"` and no
		// line arrays at all. The graft must be a no-op, never a truncation.
		const payload = {
			total: '29.97',
			total_tax: '6.71',
			line_items: [{ id: 71, product_id: 1, meta_data: uuidMeta('a') }],
			fee_lines: [{ id: 72, name: 'Surcharge', total: '0.72', meta_data: uuidMeta('f') }],
		};
		expect(graftServerLineIdentity(payload, { id: 900, total: '0.00' })).toBe(payload);
		expect(graftServerLineIdentity(payload, { id: 900, total: '0.00', line_items: [] })).toBe(
			payload
		);
	});

	it('grafts only the matched lines, leaving unmatched ones untouched', () => {
		const payload = {
			line_items: [{ product_id: 1, meta_data: uuidMeta('a') }, { product_id: 2 }],
		};
		const grafted = graftServerLineIdentity(payload, {
			line_items: [{ id: 10, meta_data: uuidMeta('a') }],
		});

		expect(grafted.line_items).toEqual([
			{ id: 10, product_id: 1, meta_data: uuidMeta('a') },
			{ product_id: 2 },
		]);
	});
});
