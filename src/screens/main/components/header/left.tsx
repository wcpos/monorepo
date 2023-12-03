import * as React from 'react';
import { useWindowDimensions } from 'react-native';

import { useNavigation, DrawerActions } from '@react-navigation/native';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Button from '@wcpos/components/src/button';
import Icon from '@wcpos/components/src/icon';
// import Logo from '@wcpos/components/src/logo';

import { useT } from '../../../../contexts/translations';

const HeaderLeft = () => {
	const { width } = useWindowDimensions();
	const theme = useTheme();
	const navigation = useNavigation();
	const t = useT();

	/**
	 *
	 */
	const handleOpenDrawer = React.useCallback(() => {
		navigation.dispatch(DrawerActions.openDrawer());
	}, [navigation]);

	/**
	 *
	 */
	if (width < theme.screens.small) {
		return (
			<Box padding="small">
				<Icon name="bars" onPress={handleOpenDrawer} type="inverse" />
			</Box>
		);
	}

	/**
	 *
	 */
	if (width < theme.screens.medium) {
		return (
			<Box padding="small">
				<Button
					onPress={handleOpenDrawer}
					title={t('Menu', { _tags: 'core' })}
					accessoryLeft={<Icon name="bars" type="inverse" />}
					type="headerBackground"
					style={{ padding: 0 }}
				/>
			</Box>
		);
	}

	return null;
};

export default HeaderLeft;
