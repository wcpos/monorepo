import * as React from 'react';

import { TILE_SURFACE } from '../lib/tile-surface';
import { cn } from '../lib/utils';
import { PressableSurface, type PressableSurfaceProps } from '../pressable-surface';
import { Text } from '../text';

export type TileVariant = 'default' | 'dashed';

export type TileProps = Omit<PressableSurfaceProps, 'children' | 'wash' | 'dimmed'> & {
	/** `dashed` is the add-another tile: no surface, a dashed border. */
	variant?: TileVariant;
	/** The tile's name, at the tile's one weight; two lines at most. */
	title?: React.ReactNode;
	/** The line under it: a share, a description; text takes the help rank, a node is drawn as given. */
	sub?: React.ReactNode;
	/** A count on its pill under the label (a denomination's pieces), `<testID>-badge`. */
	badge?: number;
	className?: string;
	children?: React.ReactNode;
	testID?: string;
};

/**
 * A pressable tile: keys and choices the cashier hits by position (denominations, payment
 * methods, split options, register movements, themes). Equal width comes from the grid it
 * sits in (CODING_STANDARDS § Design 4), never from its label.
 */
export function Tile({
	selected,
	variant = 'default',
	title,
	sub,
	badge,
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
				'min-h-tile grow flex-col items-center justify-center gap-1 px-2 py-2',
				className
			)}
			{...props}
		>
			{children}
			{title != null && (
				<Text variant="subheading" decodeHtml numberOfLines={2} className="text-center">
					{title}
				</Text>
			)}
			{typeof sub === 'string' ? (
				<Text variant="help" numberOfLines={2} className="text-center">
					{sub}
				</Text>
			) : (
				sub
			)}
			{badge !== undefined && (
				<Text
					testID={props.testID && `${props.testID}-badge`}
					className="bg-background rounded-full px-1 tabular-nums"
				>
					{badge}
				</Text>
			)}
		</PressableSurface>
	);
}
