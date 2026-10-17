import * as React from 'react';
import { type Insets, type LayoutChangeEvent, Platform } from 'react-native';

/** The smallest target a finger gets (CODING_STANDARDS § Design 2; Apple HIG 44 × 44 pt). */
export const MIN_TARGET = 44;

/**
 * Slop that grows a control drawn under 44 pt (`Button size="sm"`, `Chip size="sm"`) to a 44 pt
 * target: half of what is missing, above and below. It is measured, not assumed, because the
 * drawn height follows the scale step (`h-9` is 31.5 at Compact, 36 at Regular). It never
 * grows sideways, so chips side by side in a strip keep their own targets. React Native never
 * lets a touch area reach past the parent's bounds, so the band holds inside a row or strip
 * of 44 (the control token) and never reaches the next row's.
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
			const missing = Math.max(0, Math.ceil((MIN_TARGET - event.nativeEvent.layout.height) / 2));
			setSlop((current) =>
				(current?.top ?? 0) === missing
					? current
					: missing
						? { top: missing, bottom: missing }
						: undefined
			);
		},
		[onLayout]
	);
	return { hitSlop: measure ? slop : undefined, onLayout: measure ? handleLayout : onLayout };
}
