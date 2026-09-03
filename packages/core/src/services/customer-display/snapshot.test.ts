/** @jest-environment node */

import { MAX_SNAPSHOT_BYTES, serialiseSnapshot } from './snapshot';

test('serialises a snapshot without changing data that fits', () => {
	const value = { action: 'cart.updated', payload: { order: { lines: [] }, ledger: {} } };
	expect(JSON.parse(serialiseSnapshot(value))).toEqual(value);
});

test('truncates a 300 KiB order in contract order and stays under 200 KiB', () => {
	const huge = '😀'.repeat(38_400);
	const value = {
		action: 'cart.updated',
		payload: {
			order: {
				customer_note: huge,
				lines: [
					{ id: 'oldest', meta: Array.from({ length: 12 }, (_, id) => ({ id, value: huge })) },
					{ id: 'middle', meta: Array.from({ length: 12 }, (_, id) => ({ id, value: huge })) },
					{ id: 'newest', meta: [] },
				],
				totals: { total: 10 },
			},
			ledger: { total_raw: 10 },
		},
	};
	const text = serialiseSnapshot(value);
	const result = JSON.parse(text);

	expect(new TextEncoder().encode(text).byteLength).toBeLessThanOrEqual(MAX_SNAPSHOT_BYTES);
	expect(
		new TextEncoder().encode(result.payload.order.customer_note).byteLength
	).toBeLessThanOrEqual(1024);
	expect(result.payload.order.lines_truncated).toBe(true);
	expect(result.payload.order.lines.at(-1)?.id).toBe('newest');
	expect(result.payload.ledger).toEqual({ total_raw: 10 });
	expect(result.payload.order.totals).toEqual({ total: 10 });
});

test('limits line metadata before dropping old lines', () => {
	const value = {
		payload: {
			order: {
				customer_note: '',
				lines: [
					{
						id: 'line',
						meta: Array.from({ length: 9 }, (_, id) => ({ id, x: 'x'.repeat(24_000) })),
					},
				],
			},
		},
	};
	const result = JSON.parse(serialiseSnapshot(value));
	expect(result.payload.order.lines[0].meta).toHaveLength(8);
});

test('stops truncating once the customer note makes the event fit', () => {
	const value = {
		payload: {
			order: {
				customer_note: 'x'.repeat(210_000),
				lines: [{ meta: Array.from({ length: 9 }, (_, id) => ({ id })) }],
			},
		},
	};
	const result = JSON.parse(serialiseSnapshot(value));
	expect(result.payload.order.lines[0].meta).toHaveLength(9);
});
