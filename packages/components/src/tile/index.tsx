import * as React from 'react';

import { TILE_SURFACE } from '../lib/tile-surface';
import { cn } from '../lib/utils';
import { PressableSurface, type PressableSurfaceProps } from '../pressable-surface';

export type TileSize = 'tile' | 'auto';
export type TileVariant = 'default' | 'dashed';

export type TileProps = Omit<PressableSurfaceProps, 'children' | 'wash' | 'dimmed'> & {
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
	...props
}: TileProps) {
	return (
		<PressableSurface
			selected={selected}
			className={cn(
				TILE_SURFACE.base,
				variant === 'dashed' ? TILE_SURFACE.dashed : TILE_SURFACE.rest,
				selected && TILE_SURFACE.selected,
				sizes[size],
				className
			)}
			{...props}
		>
			{children}
		</PressableSurface>
	);
}
