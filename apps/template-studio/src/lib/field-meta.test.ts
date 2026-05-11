import { describe, expect, it } from 'vitest';

import { ReceiptDataSchema } from '@wcpos/printer/encoder';

import { ARRAY_DEFAULTS, SECTIONS } from './field-meta';

describe('field metadata defaults', () => {
	it('has an editable section for every receipt data top-level field except system-only hints', () => {
		const sectionKeys = SECTIONS.map((section) => section.key).sort();
		const receiptDataKeys = Object.keys(ReceiptDataSchema.shape)
			.filter((key) => key !== 'presentation_hints')
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
});
