import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 *
 */
export { useAugmentedRef, useControllableState } from '@rn-primitives/hooks';

/**
 *
 */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/**
 *
 */
export const getTailwindJustifyClass = (align: 'left' | 'right' | 'center') => {
	switch (align) {
		case 'left':
			return 'justify-start';
		case 'right':
			return 'justify-end';
		case 'center':
			return 'justify-center';
		default:
			return '';
	}
};
