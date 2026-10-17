import * as React from 'react';
import { Pressable, type PressableProps, View } from 'react-native';

import { Icon, type IconName } from '../icon';
import { usePointer } from '../lib/device';
import { cn } from '../lib/utils';
import { Text } from '../text';

export type NavItemSize = 'row' | 'drawer';

export type NavItemProps = Omit<PressableProps, 'children'> & {
	selected?: boolean;
	/** A name is painted by the item's state; an element (a drawer icon) paints itself. */
	icon?: IconName | React.ReactElement;
	label?: string;
	/** Trailing, after the label (a count, a dot). */
	badge?: React.ReactNode;
	chevron?: boolean;
	/** `row` (40, `rounded-md`) in an area's page list; `drawer` (48, `rounded-lg`) in the drawer. */
	size?: NavItemSize;
	className?: string;
	testID?: string;
};

const sizes: Record<NavItemSize, string> = {
	row: 'h-10 rounded-md',
	drawer: 'h-12 rounded-lg',
};

/**
 * One navigation row: the area list's rows, the drawer's items and its bell. The selected row
 * lifts onto `bg-card` (the surface the content sits on), and a press or a fine-pointer hover
 * shows the same lift.
 */
export function NavItem({
	selected = false,
	icon,
	label,
	badge,
	chevron = false,
	size = 'row',
	className,
	testID,
	...props
}: NavItemProps) {
	const pointer = usePointer();
	const drawer = size === 'drawer';
	const tint = selected
		? drawer
			? 'text-primary'
			: 'text-foreground'
		: drawer
			? 'text-sidebar-foreground'
			: 'text-muted-foreground';
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityState={{ selected }}
			aria-selected={selected}
			className={cn(
				'flex-row items-center gap-3 px-3',
				sizes[size],
				!label && 'justify-center',
				'active:bg-card',
				pointer === 'fine' && 'web:hover:bg-card',
				selected && 'bg-card',
				className
			)}
			testID={testID}
			{...props}
		>
			{typeof icon === 'string' ? (
				<Icon name={icon} size={drawer ? 'xl' : 'sm'} className={tint} />
			) : (
				icon
			)}
			{label ? (
				<Text
					testID={testID ? `${testID}-label` : undefined}
					className={cn('flex-1', !drawer && 'text-sm', tint)}
					numberOfLines={1}
				>
					{label}
				</Text>
			) : null}
			{badge ? <View className="relative h-5 w-5">{badge}</View> : null}
			{chevron ? <Icon name="chevronRight" className="text-muted-foreground" /> : null}
		</Pressable>
	);
}
