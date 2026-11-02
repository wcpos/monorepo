import type * as React from 'react';
import { View } from 'react-native';

import { Avatar } from '../avatar';
import { Icon } from '../icon';
import { Text } from '../text';
import { ListRow } from './index';

const onPress = () => {};
// A list sits on a card, as the management lists and the cart do.
const list = (children: React.ReactNode) => <View className="bg-card w-80">{children}</View>;
const chevron = <Icon name="chevronRight" className="text-muted-foreground" />;
const person = (name: string, line: string) => (
	<>
		<Text numberOfLines={1}>{name}</Text>
		<Text numberOfLines={1} variant="key">
			{line}
		</Text>
	</>
);

export const stories = [
	{
		id: 'default',
		render: () =>
			list(
				<>
					<ListRow
						leading={<Avatar fallback="AL" size="md" />}
						trailing={chevron}
						onPress={onPress}
						testID="list-row-1"
					>
						{person('Ada Lovelace', 'ada@example.com')}
					</ListRow>
					<ListRow
						leading={<Avatar fallback="GH" size="md" />}
						trailing={
							<>
								<Text className="tabular-nums">18,00 €</Text>
								{chevron}
							</>
						}
						onPress={onPress}
						testID="list-row-2"
					>
						{person('Grace Hopper', 'grace@example.com')}
					</ListRow>
				</>
			),
	},
	{
		id: 'selected',
		render: () =>
			list(
				<>
					<ListRow selected onPress={onPress} testID="list-row-on">
						{person('Order 1042', 'Coffee ×2, Croissant')}
					</ListRow>
					<ListRow selected={false} onPress={onPress} testID="list-row-off">
						{person('Order 1043', 'Tea')}
					</ListRow>
				</>
			),
	},
	{
		id: 'sm',
		render: () =>
			list(
				<>
					<ListRow size="sm" trailing={chevron} onPress={onPress} testID="list-row-sm">
						<Text numberOfLines={1}>Last closure</Text>
					</ListRow>
					<ListRow size="sm" disabled onPress={onPress} testID="list-row-disabled">
						<Text numberOfLines={1}>No brands yet</Text>
					</ListRow>
				</>
			),
	},
];
