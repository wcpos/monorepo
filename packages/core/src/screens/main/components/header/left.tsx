import * as React from 'react';
import { useWindowDimensions } from 'react-native';

import { useNavigation, DrawerActions } from '@react-navigation/native';

import { Button, ButtonText } from '@wcpos/components/src/button';
import { Icon } from '@wcpos/components/src/icon';

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
			<Button
				onPress={handleOpenDrawer}
				className="px-3 rounded-none bg-transparent hover:bg-white/10"
			>
				<Icon name="bars" />
			</Button>
		);
	}

	/**
	 *
	 */
	return (
		<Button
			onPress={handleOpenDrawer}
			className="px-3 rounded-none bg-transparent hover:bg-white/10"
			leftIcon="bars"
		>
			<ButtonText>{t('Menu', { _tags: 'core' })}</ButtonText>
		</Button>
	);
};

export default HeaderLeft;
