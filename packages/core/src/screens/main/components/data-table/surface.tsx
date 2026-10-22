import * as React from 'react';
import { View, type ViewProps } from 'react-native';

import { useIsPhone } from '@wcpos/components/lib/device';
import { cn } from '@wcpos/components/lib/utils';

import { useGround } from '../ground';

/**
 * The one surface every table and tile grid sits on: a white card with a hairline border and
 * one radius, inset by the page gutter (`--spacing-gutter`, 12 at Regular) on every list surface
 * — Products, Orders, Customers, Coupons and the POS products column alike — so its edge lines
 * up with the search and the chips above it. The card owns its sides and its bottom only: the
 * row above it (the chip row's `p-gutter`, or `ListColumn`'s body `pt-gutter` where there are no
 * chips) owns the gutter over it, so there is exactly one gutter between the chips and the card
 * and the pending-search line between them still runs the pane's full width. The phone has no
 * ground to show around it — the list runs edge to edge under a hairline instead.
 *
 * Owner's choice from the 2026-10-05 mockup (white card, rounded) over edge-to-edge white and
 * one-card-per-day; applied inside DataTable, its skeleton and the POS grid so every mount
 * agrees without each screen remembering to wrap.
 */
export function TableSurface({ className, ...props }: ViewProps) {
	const phone = useIsPhone();
	return (
		<View
			className={cn(
				'bg-card border-border min-h-0 flex-1',
				phone ? 'border-t' : 'mx-gutter mb-gutter overflow-hidden rounded-lg border',
				className
			)}
			{...props}
		/>
	);
}

/**
 * The ground a tile grid stands on, in the card's place: a Poster tile carries 4 of its own
 * margin; the ground gives the page gutter minus it, so tiles sit one gutter from the sides and
 * under the row above, like the table card. A child that moves itself (the deal's air frame)
 * goes inside, never on the element taking the tiles' margin back.
 */
export function TileGround({ children }: { children: React.ReactNode }) {
	// The phone's screen edge keeps 16 (`useGround`), as the chip row above the tiles does.
	return (
		<View className={cn('min-h-0 flex-1', useGround().px)}>
			<View className="-mx-1 -mt-1 min-h-0 flex-1">{children}</View>
		</View>
	);
}

/**
 * The caption row's inset under the card: the card's gutter, then the cell's own 12 (`px-3`),
 * so the footer's text lines up with the cells' (12 + 12 at Regular); on a phone, where the
 * card runs edge to edge, the cell's 12 alone. The caption row is the pane's last row, so it
 * also carries the gutter below it: the container insets its last child from its bottom edge as
 * it does its first from the top (owner, 2026-10-20: "consistent, including at the bottom").
 * The phone's list runs edge to edge and its screen already pads the home indicator, so it keeps
 * no bottom gutter. The mount owns it; a footer component carries no padding of its own.
 */
export function CaptionRowInset({ children }: { children: React.ReactNode }) {
	const phone = useIsPhone();
	return (
		<View testID="data-table-caption-inset" className={phone ? undefined : 'px-gutter pb-gutter'}>
			<View className="px-3">{children}</View>
		</View>
	);
}
