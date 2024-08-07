import * as React from 'react';
import { useWindowDimensions } from 'react-native';

import { useNavigation, DrawerActions } from '@react-navigation/native';
import { useTheme } from 'styled-components/native';

import { Button, ButtonText } from '@wcpos/tailwind/src/button';
import { Icon } from '@wcpos/tailwind/src/icon';
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
			<Button onPress={handleOpenDrawer}>
				<Icon name="bars" onPress={handleOpenDrawer} />
			</Button>
		);
	}

	/**
	 *
	 */
	if (width < theme.screens.medium) {
		return (
			<Button onPress={handleOpenDrawer} className="rounded-none" leftIcon="bars">
				<ButtonText>{t('Menu', { _tags: 'core' })}</ButtonText>
			</Button>
		);
	}

	return null;
};

export default HeaderLeft;
