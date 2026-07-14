/**
 * @jest-environment node
 */
import { CODE_CHARS, generateCouponCode } from './generate-code';

describe('generateCouponCode', () => {
	it('produces POS- plus 4 characters from the unambiguous charset', () => {
		const code = generateCouponCode();
		expect(code).toMatch(/^POS-[A-Z2-9]{4}$/);
		for (const char of code.slice(4)) {
			expect(CODE_CHARS).toContain(char);
		}
	});

	it('excludes ambiguous characters from the charset', () => {
		for (const ambiguous of ['0', 'O', '1', 'I', 'L']) {
			expect(CODE_CHARS).not.toContain(ambiguous);
		}
	});

	it('is deterministic for a stubbed random source', () => {
		expect(generateCouponCode(() => 0)).toBe(`POS-${CODE_CHARS[0].repeat(4)}`);
		expect(generateCouponCode(() => 0.999999)).toBe(
			`POS-${CODE_CHARS[CODE_CHARS.length - 1].repeat(4)}`
		);
	});

	it.each([1, -Number.EPSILON, NaN, Infinity])(
		'throws when any random sample is outside [0, 1): %s',
		(invalidSample) => {
			let calls = 0;
			expect(() => generateCouponCode(() => (calls++ === 0 ? 0 : invalidSample))).toThrow(
				RangeError
			);
		}
	);
});
