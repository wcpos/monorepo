import * as React from 'react';
import { View } from 'react-native';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
import Tabs from '@wcpos/components/src/tabs';

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

	useWhyDidYouUpdate('POSTabs', {
		leftComponent,
		rightComponent,
		renderScene,
		routes,
		index,
		setIndex,
	});

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

export default React.memo(POSTabs);
