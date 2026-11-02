import { describe, expect, it } from 'vitest';

import { parseVariationsEnvelope } from './collection-descriptors';

describe('parseVariationsEnvelope', () => {
	const payload = { sku: 'RED-L', name: 'Red, Large', date_modified_gmt: '2026-08-25T10:00:00' };

	it('reads a bare wc/v3 array, where identity already rides the payload', () => {
		const rows = parseVariationsEnvelope([{ ...payload, id: 12, parent_id: 9 }]);

		expect(rows).toEqual([{ ...payload, id: 12, parent_id: 9 }]);
	});

	it('accepts an empty bare page', () => {
		expect(parseVariationsEnvelope([])).toEqual([]);
	});

	it.each([
		{ documents: [{ id: 12, parent_id: 9, payload }] },
		{ documents: [] },
		{ nope: true },
		null,
	])('rejects a non-array body: %j', (body) => {
		expect(() => parseVariationsEnvelope(body)).toThrow(
			'variations pull returned a non-array body'
		);
	});
});
