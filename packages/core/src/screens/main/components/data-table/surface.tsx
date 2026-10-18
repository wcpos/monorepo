import * as React from 'react';
import { View, type ViewProps } from 'react-native';

import { useIsPhone } from '@wcpos/components/lib/device';
import { cn } from '@wcpos/components/lib/utils';

/** The container's density decides the inset (CODING_STANDARDS § Design, Gutters). */
export type TableSurfaceGutter = 'page' | 'dense';

/**
 * The one surface every table and tile grid sits on: a white card with a hairline border and
 * one radius, inset by the gutter of the container it stands in, so its edge lines up with
 * the search and the chips above it. A page (Products, Orders, Customers, Coupons) is 16; a
 * dense pane (the POS products column) is 8. The card owns its sides and its bottom only:
 * the row above it (the chip row's `p-4`, or Customers' body `pt-4` where there are no chips)
 * owns the 16 over it, so there is exactly one gutter between the chips and the card and the
 * pending-search line between them still runs the pane's full width. The phone has no ground
 * to show around it — the list runs edge to edge under a hairline instead.
 *
 * Owner's choice from the 2026-10-05 mockup (white card, rounded) over edge-to-edge white and
 * one-card-per-day; applied inside DataTable, its skeleton and the POS grid so every mount
 * agrees without each screen remembering to wrap.
 */
export function TableSurface({
	className,
	gutter = 'dense',
	...props
}: ViewProps & { gutter?: TableSurfaceGutter }) {
	const phone = useIsPhone();
	return (
		<View
			className={cn(
				'bg-card border-border min-h-0 flex-1',
				phone
					? 'border-t'
					: cn('overflow-hidden rounded-lg border', gutter === 'page' ? 'mx-4 mb-4' : 'mx-2 mb-2'),
				className
			)}
			{...props}
		/>
	);
}
