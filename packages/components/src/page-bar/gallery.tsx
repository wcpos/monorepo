import { View } from 'react-native';

import { IconButton } from '../icon-button';
import { DeviceScope } from '../lib/device';
import { PageBar } from './index';

const onPress = () => {};
const back = { label: 'Settings', onPress };
export const stories = [
	{ id: 'title', render: () => <PageBar title="Products" /> },
	{
		id: 'status',
		render: () => (
			<PageBar
				title="Products"
				subtitle="· UK Store"
				status={{ label: 'Offline', variant: 'warning' }}
			>
				<IconButton name="sliders" testID="filters" onPress={onPress} />
				<IconButton name="bell" testID="bell" onPress={onPress} />
			</PageBar>
		),
	},
	{
		id: 'phone-menu',
		render: () => (
			<DeviceScope phone>
				<View className="w-80">
					<PageBar testID="phone-menu" title="Products" onMenu={{ label: 'Menu', onPress }}>
						<IconButton name="bell" testID="phone-bell" onPress={onPress} />
					</PageBar>
				</View>
			</DeviceScope>
		),
	},
	{
		id: 'phone-back',
		render: () => (
			<DeviceScope phone>
				<View className="w-80">
					<PageBar testID="phone-back" title="Printers" back={back} />
				</View>
			</DeviceScope>
		),
	},
	{
		id: 'wide-no-leading',
		render: () => (
			<DeviceScope phone={false}>
				<PageBar testID="wide" title="Printers" onMenu={{ label: 'Menu', onPress }} back={back} />
			</DeviceScope>
		),
	},
];
