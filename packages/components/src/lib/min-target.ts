import * as React from 'react';
import { type Insets, type LayoutChangeEvent, Platform } from 'react-native';

/** The smallest target a finger gets (CODING_STANDARDS § Design 2; Apple HIG 44 × 44 pt). */
export const MIN_TARGET = 44;

/**
 * Sideways growth stops at half the 8 pt gap § Design 2 keeps between adjacent targets, so two
 * narrow controls side by side never take each other's touches.
 */
export const MAX_SIDE_SLOP = 4;

/**
 * Slop that grows a control drawn under 44 pt (`Button size="sm"`, `Chip size="sm"`) towards a
 * 44 pt target: half of what is missing above and below, and up to `MAX_SIDE_SLOP` either side
 * when it is narrower than 44. It is measured, not assumed, because the drawn size follows the
 * scale step (`h-9` is 31.5 at Compact, 36 at Regular).
 *
 * React Native never lets a touch area reach past the parent's bounds, so the band holds where
 * the sm sizes are meant to sit: inside a row of at least 44 (`min-h-row`, the control token).
 *
 * Native only: React Native Web ignores `hitSlop`, so the web neither measures nor re-renders.
 * `onLayout` is the caller's, composed.
 */
export function useMinTargetSlop(
	enabled: boolean,
	onLayout?: (event: LayoutChangeEvent) => void
): { hitSlop: Insets | undefined; onLayout: ((event: LayoutChangeEvent) => void) | undefined } {
	const measure = enabled && Platform.OS !== 'web';
	const [slop, setSlop] = React.useState<Insets | undefined>(undefined);
	const handleLayout = React.useCallback(
		(event: LayoutChangeEvent) => {
			onLayout?.(event);
			const { width, height } = event.nativeEvent.layout;
			const vertical = Math.max(0, Math.ceil((MIN_TARGET - height) / 2));
			const side = Math.min(MAX_SIDE_SLOP, Math.max(0, Math.ceil((MIN_TARGET - width) / 2)));
			setSlop((current) => {
				if ((current?.top ?? 0) === vertical && (current?.left ?? 0) === side) return current;
				if (!vertical && !side) return undefined;
				return { top: vertical, bottom: vertical, left: side, right: side };
			});
		},
		[onLayout]
	);
	return { hitSlop: measure ? slop : undefined, onLayout: measure ? handleLayout : onLayout };
}
