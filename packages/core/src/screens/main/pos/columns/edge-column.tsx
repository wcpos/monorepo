import * as React from 'react';
import { View } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cn } from '@wcpos/components/lib/utils';

/**
 * A register column that runs from the top screen edge to the bottom one.
 *
 * Apple's layout rule: backgrounds run edge to edge, and only content and controls stay inside
 * the safe area. So the column paints its own background (`className`) through the status bar
 * and the home indicator, and pads `insets.top` / `insets.bottom` INSIDE that background; the
 * system bars then float over the column they sit on. Every edge-touching surface owns its
 * inset this way, and the POS root never pads (columns ledger line 6).
 *
 * The bug this fixes (owner, iPad landscape, 2026-10-14): the POS root painted `bg-background`
 * and padded both insets for the whole stack, so the white cart column, the grey products column
 * and the divider between them stopped a bar's height short of both edges, under a flat grey
 * band across the full width.
 *
 * Web and the desktop have no system bars (the desktop's title-bar strip stays on the root),
 * so the insets are zero there and nothing moves. Android's navigation bar arrives as
 * `insets.bottom` through `react-native-edge-to-edge`; same rule, no special case.
 */
export function EdgeColumn({
	className,
	testID,
	children,
}: {
	/** The column's own background, e.g. `bg-background` (products) or `bg-card` (cart). */
	className: string;
	testID?: string;
	children: React.ReactNode;
}) {
	const { top, bottom } = useSafeAreaInsets();
	return (
		<View
			testID={testID}
			className={cn('flex-1', className)}
			style={{ paddingTop: top, paddingBottom: bottom }}
		>
			{children}
		</View>
	);
}
