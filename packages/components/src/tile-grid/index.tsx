import * as React from 'react';
import { View } from 'react-native';

import { cn } from '../lib/utils';

export function chunk<T>(items: readonly T[], columns: number): T[][] {
	return Array.from({ length: Math.ceil(items.length / columns) }, (_, row) =>
		items.slice(row * columns, (row + 1) * columns)
	);
}

/** The tiles, a fragment's included: a caller's conditional pair is two cells, not one. */
const tiles = (children: React.ReactNode): React.ReactNode[] =>
	React.Children.toArray(children).flatMap((child) =>
		React.isValidElement<{ children?: React.ReactNode }>(child) && child.type === React.Fragment
			? tiles(child.props.children)
			: [child]
	);

/** Tiles in fixed columns (§ Design 4): columns in, equal cells out, a short last row padded. */
type TileGridProps = React.PropsWithChildren<{ columns: number; className?: string }>;

export function TileGrid({ columns, children, className }: TileGridProps) {
	return (
		<View className={cn('w-full gap-2', className)}>
			{chunk(tiles(children), columns).map((row, index) => (
				<View key={index} className="flex-row gap-2">
					{Array.from({ length: columns }, (_, cell) => (
						<View key={cell} className="min-w-0 flex-1">
							{row[cell]}
						</View>
					))}
				</View>
			))}
		</View>
	);
}
