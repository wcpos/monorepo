import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const twMerge = extendTailwindMerge({
	extend: {
		theme: {
			spacing: ['ctl', 'row', 'tile', 'band'],
			// `text-amt` is the amount's font size (`--text-amt`). Unknown to the merger it reads
			// as a text COLOUR and silently wins over `text-foreground`, which is why every amount
			// painted black on the dark theme.
			text: ['amt'],
			// Every `animate-*` sets the one `animation` property, so the last wins. Unknown to the
			// merger, our keyframes (`global.css`) all stayed on a panel (`animate-pop-in` beside a
			// caller's `animate-quantity-grow`) and stylesheet order picked one. Not the names from
			// `motion.ts`: it imports Reanimated, which every `cn()` caller would then load.
			animate: [() => true],
		},
	},
});

/**
 *
 */
export { useComposedRefs, useControllableState } from '@rn-primitives/hooks';

/**
 *
 */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/**
 *
 */
export const getFlexAlign = (
	align: 'left' | 'right' | 'center'
): 'flex-start' | 'flex-end' | 'center' => {
	switch (align) {
		case 'left':
			return 'flex-start';
		case 'right':
			return 'flex-end';
		case 'center':
			return 'center';
		default:
			return 'flex-start';
	}
};
