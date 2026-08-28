import { parseSize } from './parseSize';

describe('parseSize', () => {
	test.each([
		[25, { unit: 'percent', value: 25 }],
		['25', { unit: 'percent', value: 25 }],
		['25%', { unit: 'percent', value: 25 }],
		['240px', { unit: 'pixels', value: 240 }],
	] as const)('parses %p', (size, expected) => {
		expect(parseSize(size)).toEqual(expected);
	});

	test.each(['10rem', '2em', '50vw', '12pt', 'invalid'])('rejects unsupported size %p', (size) => {
		expect(() => parseSize(size)).toThrow(`Invalid panel size "${size}"`);
	});
});
