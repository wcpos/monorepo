// Mock react-native primitives hooks to avoid ESM issues
import { cn, getFlexAlign, getTailwindJustifyClass } from './utils';

jest.mock('@rn-primitives/hooks', () => ({
	useAugmentedRef: jest.fn(),
	useControllableState: jest.fn(),
}));

describe('lib/utils', () => {
	describe('cn', () => {
		it('should merge class names', () => {
			const result = cn('class1', 'class2');
			expect(result).toContain('class1');
			expect(result).toContain('class2');
		});

		it('should handle conditional classes', () => {
			const result = cn('base', true && 'included', false && 'excluded');
			expect(result).toContain('base');
			expect(result).toContain('included');
			expect(result).not.toContain('excluded');
		});

		it('should handle undefined and null values', () => {
			const result = cn('base', undefined, null, 'valid');
			expect(result).toContain('base');
			expect(result).toContain('valid');
		});

		it('should merge tailwind classes correctly', () => {
			// twMerge should handle conflicting tailwind classes
			const result = cn('p-4', 'p-2');
			// Should keep the last one
			expect(result).toBe('p-2');
		});

		it('should handle empty inputs', () => {
			const result = cn();
			expect(result).toBe('');
		});

		it('should handle array of classes', () => {
			const result = cn(['class1', 'class2']);
			expect(result).toContain('class1');
			expect(result).toContain('class2');
		});

		it('should handle object syntax', () => {
			const result = cn({ active: true, disabled: false });
			expect(result).toContain('active');
			expect(result).not.toContain('disabled');
		});
	});

	describe('getTailwindJustifyClass', () => {
		it('should return justify-start for left', () => {
			expect(getTailwindJustifyClass('left')).toBe('justify-start');
		});

		it('should return justify-end for right', () => {
			expect(getTailwindJustifyClass('right')).toBe('justify-end');
		});

		it('should return justify-center for center', () => {
			expect(getTailwindJustifyClass('center')).toBe('justify-center');
		});

		it('should return empty string for invalid input', () => {
			// @ts-expect-error - testing invalid input
			expect(getTailwindJustifyClass('invalid')).toBe('');
		});
	});

	describe('getFlexAlign', () => {
		it('should return start for left', () => {
			expect(getFlexAlign('left')).toBe('start');
		});

		it('should return end for right', () => {
			expect(getFlexAlign('right')).toBe('end');
		});

		it('should return center for center', () => {
			expect(getFlexAlign('center')).toBe('center');
		});

		it('should return start for invalid input', () => {
			// @ts-expect-error - testing invalid input
			expect(getFlexAlign('invalid')).toBe('start');
		});
	});
});
