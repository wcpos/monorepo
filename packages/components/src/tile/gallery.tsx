import type * as React from 'react';
import { View } from 'react-native';

import { Icon } from '../icon';
import { Text } from '../text';
import { Tile } from './index';

const onPress = () => {};
// Tiles sit in a fixed-column grid on the card, as the tender and register panes lay them out.
const grid = (children: React.ReactNode) => (
	<View className="bg-card w-80 flex-row flex-wrap gap-2 p-2">{children}</View>
);

export const stories = [
	{
		id: 'key',
		render: () =>
			grid(
				['5', '10', '20', '50'].map((value) => (
					<Tile key={value} size="tile" onPress={onPress} testID={`tile-key-${value}`}>
						<Text className="text-sm tabular-nums">{value} €</Text>
						<Text className="bg-background rounded-full px-1 tabular-nums">0</Text>
					</Tile>
				))
			),
	},
	{
		id: 'labelled',
		render: () =>
			grid(
				<>
					<Tile selected onPress={onPress} className="min-w-0 flex-1" testID="tile-cash">
						<Icon name="register" />
						<Text>Cash</Text>
					</Tile>
					<Tile onPress={onPress} className="min-w-0 flex-1" testID="tile-card">
						<Icon name="card" />
						<Text>Card</Text>
					</Tile>
					<Tile disabled onPress={onPress} className="min-w-0 flex-1" testID="tile-off">
						<Icon name="gift" />
						<Text>Gift card</Text>
					</Tile>
				</>
			),
	},
	{
		id: 'dashed',
		render: () =>
			grid(
				<Tile variant="dashed" onPress={onPress} className="flex-1" testID="tile-dashed">
					<Icon name="plus" />
					<Text className="text-muted-foreground text-sm">Add another</Text>
				</Tile>
			),
	},
];
