import { describe, expect, it } from 'vitest';

import { parseVariationsEnvelope } from './collection-descriptors';

/**
 * The variations pull seam accepts BOTH wire shapes.
 *
 * `/variations` is the only targeted lane that wraps its rows; `/products` and `/customers` answer
 * with a bare wc/v3 array. The wrapper only ever supplied `id` and `parent_id`, and WooCommerce has
 * carried both in the variation payload since WC 8.3 (the plugin backfills them below that) — so it
 * adds nothing.
 *
 * Tolerance has to ship BEFORE the server can change: this parser used to throw on anything that was
 * not `{ documents: [...] }`, so a plugin release that dropped the wrapper would have broken
 * variation sync on every deployed till at the moment the merchant updated.
 */
describe('parseVariationsEnvelope', () => {
	const payload = { sku: 'RED-L', name: 'Red, Large', date_modified_gmt: '2026-08-25T10:00:00' };

	it('reads the wrapper envelope, lifting identity out of the wrapper', () => {
		const rows = parseVariationsEnvelope({
			documents: [{ id: 12, parent_id: 9, payload, _rxdb_digest: '99' }],
		});

		expect(rows).toEqual([{ ...payload, id: 12, parent_id: 9, _rxdb_digest: '99' }]);
	});

	it('reads a bare wc/v3 array, where identity already rides the payload', () => {
		const rows = parseVariationsEnvelope([{ ...payload, id: 12, parent_id: 9 }]);

		expect(rows).toEqual([{ ...payload, id: 12, parent_id: 9 }]);
	});

	it('produces the same record from either shape', () => {
		const fromWrapper = parseVariationsEnvelope({ documents: [{ id: 12, parent_id: 9, payload }] });
		const fromBare = parseVariationsEnvelope([{ ...payload, id: 12, parent_id: 9 }]);

		expect(fromBare).toEqual(fromWrapper);
	});

	it('accepts an empty page in either shape', () => {
		expect(parseVariationsEnvelope({ documents: [] })).toEqual([]);
		expect(parseVariationsEnvelope([])).toEqual([]);
	});

	it('still refuses a body that is neither', () => {
		expect(() => parseVariationsEnvelope({ nope: true })).toThrow(
			/neither a documents array nor a bare array/
		);
		expect(() => parseVariationsEnvelope(null)).toThrow();
	});
});
