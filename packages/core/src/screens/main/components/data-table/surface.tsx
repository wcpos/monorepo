import * as React from 'react';
import { View, type ViewProps } from 'react-native';

import { useIsPhone } from '@wcpos/components/lib/device';
import { cn } from '@wcpos/components/lib/utils';

/**
 * The one surface every table and tile grid sits on: a white card with a hairline border and
 * one radius, inset from the ground by the same 8 pt the filter chips are, so its edge lines
 * up with theirs. The phone has no ground to show around it — the list runs edge to edge
 * under a hairline instead.
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
				phone ? 'border-t' : 'mx-2 mb-2 overflow-hidden rounded-xl border',
				className
			)}
			{...props}
		/>
	);
}
