import { View } from 'react-native';

import { Avatar } from '../avatar';
import { Icon } from '../icon';
import { MenuRow, MenuRowSeparator } from './index';

const onPress = () => {};
export const stories = [
	{
		id: 'plain',
		render: () => (
			<View className="bg-card w-80 gap-2 p-2">
				<MenuRow
					testID="menu-row-user"
					label="Ada Lovelace"
					leading={<Avatar fallback="AL" size="md" />}
					onPress={onPress}
				/>
				<MenuRow
					testID="menu-row-register"
					label="Switch register"
					description="Finish the current sale first"
					disabled
					onPress={onPress}
				/>
				<MenuRow
					testID="menu-row-settings"
					label="Settings"
					leading={<Icon name="gear" />}
					trailing={<Icon name="chevronRight" />}
					onPress={onPress}
				/>
			</View>
		),
	},
	{
		id: 'choice',
		render: () => (
			<View className="bg-card w-80 gap-2 p-2">
				<MenuRow testID="menu-row-today" label="Today" choice selected onPress={onPress} />
				<MenuRow
					testID="menu-row-yesterday"
					label="Yesterday"
					choice
					selected={false}
					onPress={onPress}
				/>
			</View>
		),
	},
	{
		id: 'destructive',
		render: () => (
			<View className="bg-card w-80 gap-2 p-2">
				<MenuRow
					testID="menu-row-details"
					label="Details"
					leading={<Icon name="circleInfo" />}
					onPress={onPress}
				/>
				<MenuRowSeparator />
				<MenuRow
					testID="menu-row-forget"
					label="Forget reader"
					leading={<Icon name="trash" />}
					variant="destructive"
					onPress={onPress}
				/>
			</View>
		),
	},
];
