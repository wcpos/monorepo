import { panelCsv } from './export-csv';

import type { PanelSpec } from './specs';
const spec: PanelSpec = {
	head: ['Product', 'Amount'],
	keys: ['product', 'amount'],
	types: ['text', 'money'],
	totalRaw: ['Total', 2],
	rows: [{ key: 'a', cells: ['A "quote", here', '£2.00'], raw: ['A "quote", here', 2] }],
	total: ['Total', '£2.00'],
	align: ['left', 'right'],
};
// Omitting totals, changing line endings, or bypassing the shared escaper breaks these.
it('the CSV has the head, the rows and the total, CRLF-joined', () => {
	expect(panelCsv(spec)).toBe(
		'"Product","Amount"\r\n"A ""quote"", here","£2.00"\r\n"Total","£2.00"'
	);
});
it('a cell starting with = is prefixed', () => {
	expect(
		panelCsv({
			...spec,
			rows: [{ key: 'a', cells: ['=1+1', '£2.00'], raw: ['=1+1', 2] }],
			total: [],
		})
	).toBe('"Product","Amount"\r\n"\'=1+1","£2.00"\r\n');
});
it('a negative cell is written with the hyphen it had before the screen showed a true minus', () => {
	expect(
		panelCsv({
			...spec,
			rows: [{ key: 'a', cells: ['A', '\u2212£5.00'], raw: ['A', -5] }],
			total: [],
		})
	).toBe('"Product","Amount"\r\n"A","\'-£5.00"\r\n');
});
it('a name that starts with a true minus is the merchant\u2019s text and is exported as it reads', () => {
	expect(
		panelCsv({
			...spec,
			rows: [{ key: 'a', cells: ['\u22125°C gloves', '£2.00'], raw: ['\u22125°C gloves', 2] }],
			total: [],
		})
	).toBe('"Product","Amount"\r\n"\u22125°C gloves","£2.00"\r\n');
});
