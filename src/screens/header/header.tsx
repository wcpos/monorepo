import * as React from 'react';
import { DrawerHeaderProps } from '@react-navigation/drawer';
import { Header as ReactNavigationHeader } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useObservableState } from 'observable-hooks';
import useAppState from '@wcpos/hooks/src/use-app-state';
import Platform from '@wcpos/core/src/lib/platform';
import Left from './left';
import Right from './right';

const Header = ({ route, layout, options }: DrawerHeaderProps) => {
	const insets = useSafeAreaInsets();
	const left = React.useCallback(() => <Left />, []);
	const right = React.useCallback(() => <Right />, []);
	const { store } = useAppState();
	const storeName = useObservableState(store.name$, store.name);

	// const title = React.useMemo(() => {
	// 	return `${route.name} - ${store.name}`;
	// }, [route.name, store.name]);

	return (
		<>
			<ReactNavigationHeader
				title={`${route.name} - ${storeName}`}
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
