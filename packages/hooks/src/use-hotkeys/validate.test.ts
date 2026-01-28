import { isAlphaNumeric } from './validate';

describe('use-hotkeys/validate', () => {
	describe('isAlphaNumeric', () => {
		describe('single letters', () => {
			it('should return true for lowercase letters', () => {
				expect(isAlphaNumeric('a')).toBe(true);
				expect(isAlphaNumeric('z')).toBe(true);
				expect(isAlphaNumeric('m')).toBe(true);
			});

			it('should return true for uppercase letters', () => {
				expect(isAlphaNumeric('A')).toBe(true);
				expect(isAlphaNumeric('Z')).toBe(true);
				expect(isAlphaNumeric('M')).toBe(true);
			});
		});

		describe('single digits', () => {
			it('should return true for digits 0-9', () => {
				expect(isAlphaNumeric('0')).toBe(true);
				expect(isAlphaNumeric('1')).toBe(true);
				expect(isAlphaNumeric('5')).toBe(true);
				expect(isAlphaNumeric('9')).toBe(true);
			});
		});

		describe('invalid inputs', () => {
			it('should return false for multiple characters', () => {
				expect(isAlphaNumeric('ab')).toBe(false);
				expect(isAlphaNumeric('123')).toBe(false);
				expect(isAlphaNumeric('a1')).toBe(false);
			});

			it('should return false for empty string', () => {
				expect(isAlphaNumeric('')).toBe(false);
			});

			it('should return false for special characters', () => {
				expect(isAlphaNumeric('!')).toBe(false);
				expect(isAlphaNumeric('@')).toBe(false);
				expect(isAlphaNumeric('#')).toBe(false);
				expect(isAlphaNumeric('$')).toBe(false);
				expect(isAlphaNumeric('-')).toBe(false);
				expect(isAlphaNumeric('_')).toBe(false);
				expect(isAlphaNumeric('.')).toBe(false);
				expect(isAlphaNumeric(' ')).toBe(false);
			});

			it('should return false for whitespace', () => {
				expect(isAlphaNumeric(' ')).toBe(false);
				expect(isAlphaNumeric('\t')).toBe(false);
				expect(isAlphaNumeric('\n')).toBe(false);
			});
		});
	});
});
