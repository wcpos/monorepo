import { expect, test } from '@playwright/test';

import { cashInputs } from './cash-figure';

/** Unit-style pin for the count field's inputs, read from the drawer tile's figure. No page. */
test.describe('cashInputs', () => {
	test('one or two digits after the last separator are the decimals', () => {
		expect(cashInputs('$100.50')).toEqual(['100.50']);
		expect(cashInputs('€1.234,56')).toEqual(['1234.56']);
	});

	test('a figure without a separator is its digits', () => {
		expect(cashInputs('$100')).toEqual(['100']);
	});

	test('three digits after the last separator give both readings, thousands first', () => {
		expect(cashInputs('$1,234')).toEqual(['1234', '1.234']);
		expect(cashInputs('100.125')).toEqual(['100125', '100.125']);
		expect(cashInputs('1,234.125')).toEqual(['1234125', '1234.125']);
	});
});
