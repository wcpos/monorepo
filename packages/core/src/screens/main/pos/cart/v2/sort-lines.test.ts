import { sortLines } from './sort-lines';

const lines = [
	{ position: 0, kind: 'shipping', name: 'Shipping', price: 0 },
	{ position: 0, kind: 'line', name: 'Zebra', price: 2 },
	{ position: 0, kind: 'fee', name: 'Fee', price: 0 },
	{ position: 1, kind: 'line', name: 'Apple', price: 3 },
	{ position: 2, kind: 'line', name: 'Bear', price: 1 },
] as const;
it.each([
	['newest_bottom', ['Zebra', 'Apple', 'Bear']],
	['newest_top', ['Bear', 'Apple', 'Zebra']],
	['name', ['Apple', 'Bear', 'Zebra']],
	['price', ['Bear', 'Zebra', 'Apple']],
] as const)('%s keeps fees then shipping last without mutating input', (setting, expected) => {
	const before = [...lines];
	expect(sortLines(lines, setting).map((line) => line.name)).toEqual([
		...expected,
		'Fee',
		'Shipping',
	]);
	expect(lines).toEqual(before);
});
