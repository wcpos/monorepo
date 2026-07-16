import { describe, expect, it } from 'vitest';

import { ReceiptDataSchema, ReceiptLineItemSchema } from '@wcpos/printer/encoder';

import { ARRAY_DEFAULTS, SECTIONS } from './field-meta';

describe('field metadata defaults', () => {
	it('has an editable section for every receipt data top-level field except system-only hints', () => {
		// has_tax_summary is derived — mapReceiptData re-derives it from the
		// tax_summary rows at render time, so editing it would be meaningless.
		const SYSTEM_ONLY_KEYS = ['presentation_hints', 'has_tax_summary'];
		const sectionKeys = SECTIONS.map((section) => section.key).sort();
		const receiptDataKeys = Object.keys(ReceiptDataSchema.shape)
			.filter((key) => !SYSTEM_ONLY_KEYS.includes(key))
			.sort();

		expect(sectionKeys).toEqual(receiptDataKeys);
	});

	it('adds refunds with every editable date variant present', () => {
		const refund = ARRAY_DEFAULTS.refunds as { date?: Record<string, string> };
		expect(Object.keys(refund.date ?? {}).sort()).toEqual([
			'date',
			'date_dmy',
			'date_full',
			'date_long',
			'date_mdy',
			'date_short',
			'date_ymd',
			'datetime',
			'datetime_full',
			'datetime_long',
			'datetime_short',
			'day',
			'month',
			'month_long',
			'month_short',
			'time',
			'weekday_long',
			'weekday_short',
			'year',
		]);
	});

	it('mirrors required Receipt Data v1.1 line fields in the add-row default', () => {
		const line = ARRAY_DEFAULTS.lines as Record<string, unknown>;
		for (const key of Object.keys(ReceiptLineItemSchema.shape)) {
			if (
				!ReceiptLineItemSchema.shape[key as keyof typeof ReceiptLineItemSchema.shape].isOptional()
			) {
				expect(line, key).toHaveProperty(key);
			}
		}
	});
});
