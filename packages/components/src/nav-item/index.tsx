import * as React from 'react';
import { View } from 'react-native';

import { Icon, type IconName } from '../icon';
import { cn } from '../lib/utils';
import { PressableSurface, type PressableSurfaceProps } from '../pressable-surface';
import { Text } from '../text';
import { TextClassContext } from '../text/context';

export type NavItemSize = 'row' | 'drawer';

export type NavItemProps = Omit<PressableSurfaceProps, 'children' | 'wash' | 'role'> & {
	/** A name is painted by the item's state; an element (a drawer icon) paints itself. */
	icon?: IconName | React.ReactElement;
	/** A string is painted by state; an element (a route's rendered `drawerLabel`) paints itself. */
	label?: string | React.ReactElement;
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
 * One navigation row: the area list's rows lift onto `bg-card` on selection, press and hover.
 * The drawer uses its own rail wash and selected surface: in light, the active square lifts to
 * card with selected ink; the other themes keep their selected tint.
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
	const drawer = size === 'drawer';
	const tint = selected
		? drawer
			? 'text-rail-selected-foreground'
			: 'text-foreground'
		: drawer
			? 'text-sidebar-foreground'
			: 'text-muted-foreground';
	return (
		<PressableSurface
			role="button"
			selected={selected}
			wash={drawer ? 'rail' : 'card'}
			className={cn(
				'flex-row items-center gap-3 px-3',
				sizes[size],
				!label && 'justify-center',
				selected && (drawer ? 'bg-rail-selected' : 'bg-card'),
				selected && drawer && 'web:hover:bg-rail-selected active:bg-rail-selected',
				className
			)}
			testID={testID}
			{...props}
		>
			<TextClassContext.Provider value={tint}>
				{typeof icon === 'string' ? <Icon name={icon} size={drawer ? 'xl' : 'sm'} /> : icon}
				{label && typeof label !== 'string' ? (
					<View className="min-w-0 flex-1">{label}</View>
				) : label ? (
					<Text
						testID={testID ? `${testID}-label` : undefined}
						className={cn('flex-1', !drawer && 'text-sm')}
						numberOfLines={1}
					>
						{label}
					</Text>
				) : null}
				{badge ? <View className="relative h-5 w-5">{badge}</View> : null}
				{chevron ? <Icon name="chevronRight" className="text-muted-foreground" /> : null}
			</TextClassContext.Provider>
		</PressableSurface>
	);
}
