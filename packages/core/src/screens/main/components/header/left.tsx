import * as React from 'react';

import { useNavigation } from 'expo-router';

import { Button, ButtonText } from '@wcpos/components/button';
import { Icon } from '@wcpos/components/icon';

import { useTheme } from '../../../../contexts/theme';
import { useT } from '../../../../contexts/translations';

const HeaderLeft = () => {
	const { screenSize } = useTheme();
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
	if (screenSize === 'lg') {
		return null;
	}

	/**
	 * Small screen
	 */
	if (screenSize === 'sm') {
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
