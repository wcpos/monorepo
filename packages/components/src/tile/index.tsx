import * as React from 'react';
import { Pressable, type PressableProps } from 'react-native';

import { usePointer } from '../lib/device';
import { TILE_SURFACE } from '../lib/tile-surface';
import { cn } from '../lib/utils';

export type TileSize = 'tile' | 'auto';
export type TileVariant = 'default' | 'dashed';

export type TileProps = Omit<PressableProps, 'children'> & {
	ref?: React.Ref<React.ComponentRef<typeof Pressable>>;
	/** The picked one of a set (a payment method, a theme, a split). */
	selected?: boolean;
	/** `tile` is the 64 pt square key (a denomination); `auto` is a labelled tile, 64 pt or taller. */
	size?: TileSize;
	/** `dashed` is the add-another tile: no surface, a dashed border. */
	variant?: TileVariant;
	className?: string;
	children?: React.ReactNode;
	testID?: string;
};

const sizes: Record<TileSize, string> = {
	tile: 'size-tile items-center justify-center gap-1',
	auto: 'min-h-tile flex-col items-center justify-center gap-1 px-2 py-2',
};

/**
 * A pressable tile: keys and choices the cashier hits by position (denominations, payment
 * methods, split options, register movements, themes). Equal width comes from the grid it
 * sits in (CODING_STANDARDS § Design 4), never from its label.
 */
export function Tile({
	selected,
	size = 'auto',
	variant = 'default',
	className,
	children,
	disabled,
	onPress,
	role,
	accessibilityRole,
	...props
}: TileProps) {
	const pointer = usePointer();
	const radio = (role ?? accessibilityRole) === 'radio';
	return (
		<Pressable
			role={role}
			accessibilityRole={accessibilityRole ?? (role || !onPress ? undefined : 'button')}
			// A tile without an action is no tab stop (react-native-web ignores `focusable`).
			tabIndex={onPress ? undefined : -1}
			// Native announces the picked one (RN maps it onto the selected state); a radio carries
			// `aria-checked` instead.
			aria-selected={radio ? undefined : selected}
			disabled={disabled}
			onPress={onPress}
			className={cn(
				TILE_SURFACE.base,
				variant === 'dashed' ? TILE_SURFACE.dashed : TILE_SURFACE.rest,
				selected && TILE_SURFACE.selected,
				pointer === 'fine' && 'web:hover:bg-muted',
				sizes[size],
				disabled && TILE_SURFACE.disabled,
				className
			)}
			{...props}
		>
			{children}
		</Pressable>
	);
}
