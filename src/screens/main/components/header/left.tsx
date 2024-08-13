import * as React from 'react';
import { useWindowDimensions } from 'react-native';

import { useNavigation, DrawerActions } from '@react-navigation/native';

import { Button, ButtonText } from '@wcpos/tailwind/src/button';
import { Icon } from '@wcpos/tailwind/src/icon';

import { useT } from '../../../../contexts/translations';

const HeaderLeft = () => {
	const { width } = useWindowDimensions();
	const navigation = useNavigation();
	const t = useT();

	/**
	 *
	 */
	const handleOpenDrawer = React.useCallback(() => {
		navigation.dispatch(DrawerActions.openDrawer());
	}, [navigation]);

	/**
	 * Large screen
	 */
	if (width > 1024) {
		return null;
	}

	/**
	 * Small screen
	 */
	if (width < 640) {
		return (
			<Button onPress={handleOpenDrawer}>
				<Icon name="bars" onPress={handleOpenDrawer} />
			</Button>
		);
	}

	/**
	 *
	 */
	return (
		<Button onPress={handleOpenDrawer} className="rounded-none" leftIcon="bars">
			<ButtonText>{t('Menu', { _tags: 'core' })}</ButtonText>
		</Button>
	);
};

export default HeaderLeft;
