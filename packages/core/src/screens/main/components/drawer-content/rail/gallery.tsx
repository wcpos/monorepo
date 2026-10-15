import type * as React from 'react';
import { View } from 'react-native';

import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';

import { DrawerItem } from './drawer-item';

const examples: ({ id: string } & React.ComponentProps<typeof DrawerItem>)[] = [
	{
		id: 'focused',
		label: 'Products',
		focused: true,
		onPress: () => {},
		icon: () => <Icon name="store" className="text-primary" />,
	},
	{ id: 'unfocused', label: 'Products', onPress: () => {}, icon: () => <Icon name="store" /> },
	{
		id: 'with-badge',
		label: 'Notifications',
		onPress: () => {},
		icon: () => (
			<View>
				<Icon name="bell" />
				<Text className="bg-primary text-primary-foreground rounded-lg">3</Text>
			</View>
		),
	},
];
export const stories = examples.map(({ id, ...props }) => ({
	id,
	render: () => <DrawerItem {...props} testID={`gallery-drawer-item-${id}`} />,
}));
