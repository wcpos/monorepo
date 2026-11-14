import type * as React from 'react';
import { View } from 'react-native';

import { Text } from '../text';
import { PosterTile, type PosterTileProps } from './index';

const noop = () => {};
// The product tile's words, as `tile-words.tsx` sets them on the register.
const title = (name: string) => (
	<Text className="leading-tight font-bold" numberOfLines={2}>
		{name}
	</Text>
);
const money = (amount: string) => <Text className="font-semibold tabular-nums">{amount}</Text>;
const sub = (line: string) => <Text className="text-foreground/70 text-xs">{line}</Text>;

// Tint pictures only: a cell never waits on an image decode, and no colour literal is needed.
const examples: ({ id: string } & Omit<PosterTileProps, 'onPress' | 'testID'>)[] = [
	{
		id: 'product',
		picture: { kind: 'tint', tint: 0 },
		mark: { kind: 'count', value: 12 },
		markLabel: '12 in stock',
		title: title('Beanie with Logo'),
		money: money('£18.00'),
		accessibilityLabel: 'Beanie with Logo',
	},
	{
		id: 'low-stock',
		picture: { kind: 'tint', tint: 1 },
		mark: { kind: 'count', value: 2, low: true },
		markLabel: '2 in stock',
		title: title('Hoodie with Zipper'),
		money: money('£45.00'),
		accessibilityLabel: 'Hoodie with Zipper',
	},
	{
		id: 'backorder',
		picture: { kind: 'tint', tint: 2 },
		mark: { kind: 'backorder' },
		markLabel: 'Backorder',
		title: title('Kaffeespezialitäten und Heißgetränke'),
		money: money('£3.20'),
		accessibilityLabel: 'Kaffeespezialitäten und Heißgetränke',
	},
	{
		id: 'out',
		picture: { kind: 'tint', tint: 3 },
		out: true,
		title: title('Sunglasses'),
		money: money('Sold out'),
		accessibilityLabel: 'Sunglasses',
	},
	{
		id: 'stacked',
		picture: { kind: 'tint', tint: 4 },
		stacked: true,
		title: title('T-Shirt'),
		money: money('£18.00 – £22.00'),
		sub: sub('3 options'),
		accessibilityLabel: 'T-Shirt',
	},
	{
		// Every word slot empty: no scrim, the mark still shows (ledger line 2).
		id: 'no-words',
		picture: { kind: 'tint', tint: 5 },
		mark: { kind: 'glyph', name: 'filters' },
		accessibilityLabel: 'Shortcut',
	},
];

// A tile at a grid cell's width, in a row as the grid lays it.
export const stories = examples.map(({ id, ...props }) => ({
	id,
	render: () => (
		<View className="w-48 flex-row">
			<PosterTile {...props} onPress={noop} testID={`gallery-poster-tile-${id}`} />
		</View>
	),
}));
