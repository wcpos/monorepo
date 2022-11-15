import * as React from 'react';
import { View } from 'react-native';

import { DrawerHeaderProps } from '@react-navigation/drawer';
import { Header as ReactNavigationHeader } from '@react-navigation/elements';
import { StatusBar } from 'expo-status-bar';
import { useObservableState } from 'observable-hooks';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from 'styled-components/native';

import Text from '@wcpos/components/src/text';

import useAuth from '../../../contexts/auth';
import Left from './left';
import Right from './right';

const Header = ({ route, layout, options }: DrawerHeaderProps) => {
	const insets = useSafeAreaInsets();
	const left = React.useCallback(() => <Left />, []);
	const right = React.useCallback(() => <Right />, []);
	const { store } = useAuth();
	const storeName = useObservableState(store.name$, store.name);
	const theme = useTheme();

	const headerStyle = React.useMemo(() => {
		// @TODO - this is required if we want to remove the OS titlebar
		// if (Platform.isElectron) {
		// 	return {
		// 		backgroundColor: theme.colors.headerBackground,
		// 		height: 40 + insets.top,
		// 		WebkitAppRegion: 'drag',
		// 	};
		// }
		return {
			backgroundColor: theme.colors.headerBackground,
			height: 40 + insets.top,
		};
	}, [insets.top, theme.colors.headerBackground]);

	/**
	 * @TODO - text trucation doesn't trigger when screen size changes
	 */
	const headerTitle = React.useCallback(() => {
		return (
			<Text size="large" type="inverse" numberOfLines={1}>
				{options.title}
			</Text>
		);
	}, [options.title]);

	/**
	 *
	 */
	return (
		<View nativeID="titlebar">
			<ReactNavigationHeader
				title={`${route.name} - ${storeName}`}
				headerTitle={headerTitle}
				headerTitleAlign="center"
				headerStyle={headerStyle}
				headerLeft={left}
				headerRight={right}
			/>
			<StatusBar style="light" />
		</View>
	);
};

export default Header;
