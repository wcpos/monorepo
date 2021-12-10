import * as React from 'react';
import { View } from 'react-native';
import { Tabs, TabsProps } from './tabs';

export default {
	title: 'Components/Tabs',
	component: Tabs,
};

const FirstRoute = () => <View style={{ backgroundColor: '#ff4081', width: 100, height: 100 }} />;

const SecondRoute = () => <View style={{ backgroundColor: '#673ab7', width: 100, height: 100 }} />;

const renderScene = ({ route }) => {
	switch (route.key) {
		case 'first':
			return <FirstRoute />;
		case 'second':
			return <SecondRoute />;
		default:
			return null;
	}
};

const routes = [
	{ key: 'first', title: 'First' },
	{ key: 'second', title: 'Second' },
];

export const BasicUsage = (props: TabsProps<typeof routes[number]>) => {
	const [index, setIndex] = React.useState(0);

	return (
		<Tabs<typeof routes[number]>
			navigationState={{ index, routes }}
			renderScene={renderScene}
			onIndexChange={setIndex}
			{...props}
		/>
	);
};
