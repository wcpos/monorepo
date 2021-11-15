import * as React from 'react';
import { DrawerHeaderProps } from '@react-navigation/drawer';
import { Header as ReactNavigationHeader } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Platform from '@wcpos/common/src/lib/platform';
import Left from './left';
import Right from './right';

const Header = ({ route, layout }: DrawerHeaderProps) => {
	const insets = useSafeAreaInsets();
	const left = React.useCallback(() => <Left />, []);
	const right = React.useCallback(() => <Right />, []);

	return (
		<>
			<ReactNavigationHeader
				title={route.name}
				headerTitleAlign="center"
				headerTintColor="white"
				headerStyle={{ backgroundColor: '#2c3e50', height: 40 + insets.top }}
				headerLeft={left}
				headerRight={right}
			/>
			<StatusBar style="light" />
		</>
	);
};

export default Header;
