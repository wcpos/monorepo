/** @jest-environment node */

import { MAX_SNAPSHOT_BYTES, serialiseSnapshot } from './snapshot';
import { buildReceiptData } from '../../screens/main/receipt/utils/build-receipt-data';

test('serialises a snapshot without changing data that fits', () => {
	const value = { action: 'cart.updated', payload: { order: { lines: [] }, ledger: {} } };
	expect(JSON.parse(serialiseSnapshot(value))).toEqual(value);
});

test('truncates a 300 KiB order in contract order and stays under 200 KiB', () => {
	const huge = '😀'.repeat(38_400);
	const metadataValue = 'x'.repeat(2000);
	const order = buildReceiptData(
		{
			id: 123,
			number: '1234',
			status: 'completed',
			currency: 'USD',
			total: '20.00',
			total_tax: '0.00',
			customer_note: huge,
			billing: {},
			shipping: {},
			line_items: Array.from({ length: 20 }, (_, id) => ({
				id,
				name: `line-${id}`,
				quantity: 1,
				subtotal: '1.00',
				total: '1.00',
				meta_data: Array.from({ length: 12 }, (__, key) => ({
					key: String(key),
					value: metadataValue,
				})),
			})),
		},
		{ name: 'My POS Store', locale: 'en_US' }
	);
	const value = {
		action: 'cart.updated',
		payload: {
			order,
			ledger: { total_raw: 10 },
		},
	};
	const text = serialiseSnapshot(value);
	const result = JSON.parse(text);

	expect(new TextEncoder().encode(text).byteLength).toBeLessThanOrEqual(MAX_SNAPSHOT_BYTES);
	expect(
		new TextEncoder().encode(result.payload.order.order.customer_note).byteLength
	).toBeLessThanOrEqual(1024);
	expect(result.payload.order.lines_truncated).toBe(true);
	expect(result.payload.order.lines.at(-1)?.name).toBe('line-19');
	expect(result.payload.ledger).toEqual({ total_raw: 10 });
	expect(result.payload.order.totals.total).toBe('20.00');
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
				order: { customer_note: 'x'.repeat(210_000) },
				lines: [{ meta: Array.from({ length: 9 }, (_, id) => ({ id })) }],
			},
		},
	};
	const result = JSON.parse(serialiseSnapshot(value));
	expect(result.payload.order.lines[0].meta).toHaveLength(9);
});

test('drops oversized display config translations to stay under the message cap', () => {
	const value = {
		action: 'display.config',
		payload: {
			i18n: { receipt: 'x'.repeat(MAX_SNAPSHOT_BYTES) },
			presentation_hints: { locale: 'en_US' },
		},
	};
	const text = serialiseSnapshot(value);
	const result = JSON.parse(text);

	expect(new TextEncoder().encode(text).byteLength).toBeLessThanOrEqual(MAX_SNAPSHOT_BYTES);
	expect(result.payload.i18n).toEqual({});
	expect(result.payload.presentation_hints).toEqual({ locale: 'en_US' });
});

test('drops oversized order translations after dropping lines', () => {
	const value = {
		action: 'cart.updated',
		payload: {
			order: { i18n: { receipt: 'x'.repeat(MAX_SNAPSHOT_BYTES) }, lines: [] },
			ledger: { total_raw: 10 },
		},
	};
	const text = serialiseSnapshot(value);
	const result = JSON.parse(text);

	expect(new TextEncoder().encode(text).byteLength).toBeLessThanOrEqual(MAX_SNAPSHOT_BYTES);
	expect(result.payload.order.i18n).toEqual({});
	expect(result.payload.ledger).toEqual({ total_raw: 10 });
});
