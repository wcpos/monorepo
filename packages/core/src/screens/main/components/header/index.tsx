import * as React from 'react';
import { View } from 'react-native';

import { Header as ReactNavigationHeader } from '@react-navigation/elements';
import { useObservableState } from 'observable-hooks';
import { SystemBars } from 'react-native-edge-to-edge';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

import { ErrorBoundary } from '@wcpos/components/error-boundary';

import Left from './left';
import Right from './right';
import HeaderTitle from './title';
import { UpgradeNotice } from './upgrade-notice';
import { useAppState } from '../../../../contexts/app-state';

import type { DrawerHeaderProps } from '@react-navigation/drawer';

interface Props {
	options: DrawerHeaderProps['options'];
	showUpgrade: boolean;
	setShowUpgrade: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 *
 */
export const Header = ({ options, showUpgrade, setShowUpgrade }: Props) => {
	const insets = useSafeAreaInsets();
	const { store } = useAppState();
	const storeName = useObservableState(store.name$, store.name);

	// Get theme-aware colors - header uses sidebar color to match drawer
	const [sidebarColor, sidebarBorderColor] = useCSSVariable([
		'--color-sidebar',
		'--color-sidebar-border',
	]) as string[];

	/**
	 *
	 */
	return (
		<ErrorBoundary>
			<View id="titlebar">
				<ReactNavigationHeader
					title={`${options.title} - ${storeName}`}
					headerTitle={(props) => <HeaderTitle {...props} />}
					headerTitleAlign="center"
					headerStyle={{
						backgroundColor: sidebarColor,
						height: 40 + insets.top,
						borderBottomColor: sidebarBorderColor,
						/**
						 * Note - this is required if we want to remove the OS titlebar
						 * WebkitAppRegion: 'drag'
						 */
					}}
					headerLeft={Left}
					headerRight={Right}
				/>
				{/*
				 * Status bar uses 'light' style (white icons) because sidebar is always dark
				 * in all themes. This is handled by react-native-edge-to-edge which is
				 * the recommended approach for Expo SDK 54+ edge-to-edge displays.
				 */}
				<SystemBars style="light" />
				{showUpgrade && <UpgradeNotice setShowUpgrade={setShowUpgrade} />}
			</View>
		</ErrorBoundary>
	);
};
