import * as React from 'react';
import { View, Linking } from 'react-native';

import { Header as ReactNavigationHeader } from '@react-navigation/elements';
import { useObservableState } from 'observable-hooks';
import { SystemBars } from 'react-native-edge-to-edge';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
						backgroundColor: '#243B53',
						height: 40 + insets.top,
						borderBottomColor: 'rgba(0, 0, 0, 0.2)',
						/**
						 * Note - this is required if we want to remove the OS titlebar
						 * WebkitAppRegion: 'drag'
						 */
					}}
					headerLeft={Left}
					headerRight={Right}
				/>
				<SystemBars style="light" />
				{showUpgrade && <UpgradeNotice setShowUpgrade={setShowUpgrade} />}
			</View>
		</ErrorBoundary>
	);
};
