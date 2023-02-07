import * as React from 'react';
import { View } from 'react-native';

import { DrawerHeaderProps } from '@react-navigation/drawer';
import { Header as ReactNavigationHeader } from '@react-navigation/elements';
import { StatusBar } from 'expo-status-bar';
import { useObservableState } from 'observable-hooks';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from 'styled-components/native';

import Left from './left';
import Right from './right';
import HeaderTitle from './title';
import useAuth from '../../../../contexts/auth';

const Header = ({ route }: DrawerHeaderProps) => {
	const insets = useSafeAreaInsets();
	const { store } = useAuth();
	const storeName = useObservableState(store.name$, store.name);
	const theme = useTheme();

	/**
	 *
	 */
	return (
		<View nativeID="titlebar">
			<ReactNavigationHeader
				// title={`${route.name} - ${storeName}`}
				title={storeName}
				headerTitle={(props) => <HeaderTitle {...props} />}
				headerTitleAlign="center"
				headerStyle={{
					backgroundColor: theme.colors.headerBackground,
					height: 40 + insets.top,
					borderBottomColor: 'rgba(0, 0, 0, 0.2)',
					/**
					 * Note - this is required if we want to remove the OS titlebar
					 * WebkitAppRegion: 'drag'
					 */
				}}
				headerLeft={() => <Left />}
				headerRight={() => <Right />}
			/>
			<StatusBar style="light" />
		</View>
	);
};

export default Header;
