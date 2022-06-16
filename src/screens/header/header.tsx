import * as React from 'react';
import { View } from 'react-native';
import { DrawerHeaderProps } from '@react-navigation/drawer';
import { Header as ReactNavigationHeader } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useObservableState } from 'observable-hooks';
import { useTheme } from 'styled-components/native';
import useAppState from '@wcpos/hooks/src/use-app-state';
import Platform from '@wcpos/utils/src/platform';
import Left from './left';
import Right from './right';

const Header = ({ route, layout, options }: DrawerHeaderProps) => {
	const insets = useSafeAreaInsets();
	const left = React.useCallback(() => <Left />, []);
	const right = React.useCallback(() => <Right />, []);
	const { store } = useAppState();
	const storeName = useObservableState(store.name$, store.name);
	const theme = useTheme();

	const headerStyle = React.useMemo(() => {
		if (Platform.isElectron) {
			return {
				backgroundColor: theme.colors.headerBackground,
				height: 40 + insets.top,
				WebkitAppRegion: 'drag',
			};
		}
		return {
			backgroundColor: theme.colors.headerBackground,
			height: 40 + insets.top,
		};
	}, [insets.top]);

	// const title = React.useMemo(() => {
	// 	return `${route.name} - ${store.name}`;
	// }, [route.name, store.name]);
	return (
		<View nativeID="titlebar">
			<ReactNavigationHeader
				title={`${route.name} - ${storeName}`}
				headerTitleAlign="center"
				headerTintColor="white"
				headerStyle={headerStyle}
				headerLeft={left}
				headerRight={right}
			/>
			<StatusBar style="light" />
		</View>
	);
};

export default Header;
