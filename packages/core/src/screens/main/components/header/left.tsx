import * as React from 'react';
import { useWindowDimensions } from 'react-native';

import { useNavigation } from 'expo-router';

import { Button, ButtonText } from '@wcpos/components/button';
import { Icon } from '@wcpos/components/icon';

import { useT } from '../../../../contexts/translations';

const HeaderLeft = () => {
	const { width } = useWindowDimensions();
	const navigation = useNavigation();
	const t = useT();

	/**
	 *
	 */
	const handleOpenDrawer = React.useCallback(() => {
		navigation.openDrawer();
	}, [navigation]);

	/**
	 * Large screen
	 */
	if (width >= 1024) {
		return null;
	}

	/**
	 * Small screen
	 */
	if (width < 640) {
		return (
			<Button
				onPress={handleOpenDrawer}
				className="rounded-none bg-transparent px-3 hover:bg-white/10"
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
			className="rounded-none bg-transparent px-3 hover:bg-white/10"
			leftIcon="bars"
		>
			<ButtonText>{t('Menu', { _tags: 'core' })}</ButtonText>
		</Button>
	);
};

export default HeaderLeft;
