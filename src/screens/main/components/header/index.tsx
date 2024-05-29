import * as React from 'react';
import { View, Linking } from 'react-native';

import { DrawerHeaderProps } from '@react-navigation/drawer';
import { Header as ReactNavigationHeader } from '@react-navigation/elements';
import { StatusBar } from 'expo-status-bar';
import { useObservableState } from 'observable-hooks';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Icon from '@wcpos/components/src/icon';
import Link from '@wcpos/components/src/link';

import Left from './left';
import Right from './right';
import HeaderTitle from './title';
import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';

interface Props {
	options: DrawerHeaderProps['options'];
	showUpgrade: boolean;
	setShowUpgrade: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 *
 */
const Header = ({ options, showUpgrade, setShowUpgrade }: Props) => {
	const insets = useSafeAreaInsets();
	const { store } = useAppState();
	const storeName = useObservableState(store.name$, store.name);
	const theme = useTheme();
	const t = useT();

	/**
	 *
	 */
	const upgradeToProText = React.useMemo(() => {
		const texts = [
			t('Upgrade to Pro for More Features!', { _tags: 'core' }),
			t('Enjoy More with Pro – Upgrade Today!', { _tags: 'core' }),
			t('Go Pro and Enjoy Exclusive Benefits – Upgrade Now!', { _tags: 'core' }),
			t('Support Our Development – Upgrade to Pro!', { _tags: 'core' }),
			t('Support Our Work – Go Pro Today!', { _tags: 'core' }),
			t('Support Future Updates – Get Pro Now!', { _tags: 'core' }),
		];
		return texts[Math.floor(Math.random() * texts.length)];
	}, [t]);

	/**
	 *
	 */
	return (
		<View id="titlebar">
			<ReactNavigationHeader
				title={`${options.title} - ${storeName}`}
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
				headerLeft={Left}
				headerRight={Right}
			/>
			<StatusBar style="light" />
			{showUpgrade && (
				<Box padding="xSmall" style={{ backgroundColor: theme.colors.attention }}>
					<Box horizontal space="small" align="center">
						<Box style={{ width: 12 }}></Box>
						<Box fill align="center">
							<Link size="small" onPress={() => Linking.openURL('https://wcpos.com/pro')}>
								{upgradeToProText}
							</Link>
						</Box>
						<Box>
							<Icon name="xmark" size="xSmall" onPress={() => setShowUpgrade(false)} />
						</Box>
					</Box>
				</Box>
			)}
		</View>
	);
};

export default Header;
