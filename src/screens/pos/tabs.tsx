import * as React from 'react';
import { View } from 'react-native';
import Tabs from '@wcpos/common/src/components/tabs';

export interface POSTabsProps {
	leftComponent: React.ReactNode;
	rightComponent: React.ReactNode;
}

const POSTabs = ({ leftComponent, rightComponent }: POSTabsProps) => {
	const [index, setIndex] = React.useState(0);

	const renderScene = ({ route }) => {
		switch (route.key) {
			case 'products':
				return leftComponent;
			case 'cart':
				return rightComponent;
			default:
				return null;
		}
	};

	const routes = [
		{ key: 'products', title: 'Products' },
		{ key: 'cart', title: 'Cart' },
	];

	return (
		<Tabs<typeof routes[number]>
			navigationState={{ index, routes }}
			renderScene={renderScene}
			onIndexChange={setIndex}
			tabBarPosition="bottom"
			style={{ height: '100%' }}
		/>
	);
};

export default POSTabs;
