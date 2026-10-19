import * as React from 'react';
import { Pressable, type PressableProps, View } from 'react-native';

import { currentRowMark } from '../lib/current-row';
import { usePointer } from '../lib/device';
import { cn } from '../lib/utils';

export type ListRowSize = 'default' | 'sm';

export type ListRowProps = Omit<PressableProps, 'children'> & {
	ref?: React.Ref<React.ComponentRef<typeof Pressable>>;
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
 * the cart note. A hairline under each row, a press (and a fine-pointer hover) shows `bg-muted`,
 * and the body takes the room between `leading` and `trailing` so its text truncates, never
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
	disabled,
	onPress,
	role,
	accessibilityRole,
	...props
}: ListRowProps) {
	const pointer = usePointer();
	const selectable = selected !== undefined;
	const radio = (role ?? accessibilityRole) === 'radio';
	return (
		<Pressable
			role={role}
			// A row that does something is a button unless the caller names it otherwise (a radio).
			accessibilityRole={accessibilityRole ?? (role || !onPress ? undefined : 'button')}
			// A row without an action is no tab stop either (react-native-web's Pressable sets its
			// own tabIndex and ignores `focusable`).
			tabIndex={onPress ? undefined : -1}
			// Native announces it as the selected one (RN maps it onto the selected state); a radio
			// carries `aria-checked` instead.
			aria-selected={selectable && !radio ? selected : undefined}
			disabled={disabled}
			onPress={onPress}
			className={cn(
				'border-border flex-row items-center gap-3 border-b px-3 py-2',
				sizes[size],
				'active:bg-muted',
				pointer === 'fine' && 'web:hover:bg-muted',
				currentRowMark(selected),
				// The bar's 2 comes out of the row's 12, so the content stays on the same line.
				selectable && 'pl-2.5',
				disabled && 'opacity-50',
				className
			)}
			{...props}
		>
			{leading}
			<View className={cn('min-w-0 flex-1', bodyClassName)}>{children}</View>
			{trailing}
		</Pressable>
	);
}
