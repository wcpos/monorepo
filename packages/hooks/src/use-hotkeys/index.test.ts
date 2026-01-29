// Mock the react-hotkeys-hook module to avoid ESM issues
import { getKeyFromEvent, isAlphaNumeric, RNKeyboardEvent } from './index';

jest.mock('react-hotkeys-hook', () => ({
	useHotkeys: jest.fn(),
	useHotkeysContext: jest.fn(),
	useRecordHotkeys: jest.fn(),
}));

describe('use-hotkeys/index', () => {
	describe('isAlphaNumeric', () => {
		it('should return true for single alphanumeric characters', () => {
			expect(isAlphaNumeric('a')).toBe(true);
			expect(isAlphaNumeric('Z')).toBe(true);
			expect(isAlphaNumeric('5')).toBe(true);
		});

		it('should return false for non-alphanumeric characters', () => {
			expect(isAlphaNumeric('!')).toBe(false);
			expect(isAlphaNumeric('ab')).toBe(false);
			expect(isAlphaNumeric('')).toBe(false);
		});
	});

	describe('getKeyFromEvent', () => {
		it('should extract key from standard keyboard event', () => {
			const event = {
				key: 'Enter',
			} as RNKeyboardEvent;

			expect(getKeyFromEvent(event)).toBe('Enter');
		});

		it('should extract key from React Native synthetic event', () => {
			const event = {
				nativeEvent: {
					key: 'Backspace',
				},
			} as RNKeyboardEvent;

			expect(getKeyFromEvent(event)).toBe('Backspace');
		});

		it('should return null if no key property exists', () => {
			const event = {} as RNKeyboardEvent;
			expect(getKeyFromEvent(event)).toBeNull();
		});

		it('should prefer standard key property over nativeEvent', () => {
			// If both exist, standard 'key' should be used first
			const event = {
				key: 'a',
				nativeEvent: {
					key: 'b',
				},
			} as unknown as RNKeyboardEvent;

			expect(getKeyFromEvent(event)).toBe('a');
		});

		it('should handle various key values', () => {
			const testKeys = ['Escape', 'Tab', 'ArrowUp', 'ArrowDown', ' ', 'a', '1', 'F1'];

			testKeys.forEach((key) => {
				const event = { key } as RNKeyboardEvent;
				expect(getKeyFromEvent(event)).toBe(key);
			});
		});
	});
});
