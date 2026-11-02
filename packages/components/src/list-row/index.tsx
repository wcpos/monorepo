import * as React from 'react';
import { View } from 'react-native';

import { currentRowMark } from '../lib/current-row';
import { cn } from '../lib/utils';
import { PressableSurface, type PressableSurfaceProps } from '../pressable-surface';

export type ListRowSize = 'default' | 'sm';

export type ListRowProps = Omit<PressableSurfaceProps, 'children' | 'wash' | 'dimmed'> & {
	/**
	 * Set on a list whose rows can be the current one (open orders, a short choice). `true`
	 * paints the row `bg-muted` with the primary bar on its left edge; `false` keeps the bar's
	 * room, so the rows' content lines up either way. Unset: a plain list, no bar.
	 */
	selected?: boolean;
	/** Before the body: an avatar, a thumb, a check. */
	leading?: React.ReactNode;
	/** After the body: an amount, a badge, a chevron. */
	trailing?: React.ReactNode;
	/** `default` (56) for a two-line data row; `sm` (44) for a one-line row or a dense list. */
	size?: ListRowSize;
	className?: string;
	/** The body column's own layout (a `gap-1` between its lines). */
	bodyClassName?: string;
	children?: React.ReactNode;
	testID?: string;
};

const sizes: Record<ListRowSize, string> = {
	default: 'min-h-14',
	sm: 'min-h-row',
};

/**
 * One row of a list: the management lists' phone rows, closures, browse terms, open orders,
 * the cart note. A hairline under each row on the pressable surface (its press and hover wash
 * are `bg-muted`), and the body takes the room between `leading` and `trailing` so its text truncates, never
 * the amounts.
 */
export function ListRow({
	selected,
	leading,
	trailing,
	size = 'default',
	className,
	bodyClassName,
	children,
	...props
}: ListRowProps) {
	return (
		<PressableSurface
			selected={selected}
			className={cn(
				'border-border flex-row items-center gap-3 border-b px-3 py-2',
				sizes[size],
				currentRowMark(selected),
				// The bar's 2 comes out of the row's 12, so the content stays on the same line.
				selected !== undefined && 'pl-2.5',
				className
			)}
			{...props}
		>
			{leading}
			<View className={cn('min-w-0 flex-1', bodyClassName)}>{children}</View>
			{trailing}
		</PressableSurface>
	);
}
