import * as React from 'react';

import { useNavigation } from 'expo-router';

import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';

import { useTheme } from '../../../../contexts/theme';
import { useT } from '../../../../contexts/translations';

/**
 * Header left button - uses sidebar-foreground for icons/text since
 * the header has a dark sidebar background in all themes.
 */
const HeaderLeft = () => {
	const { screenSize } = useTheme();
	const navigation = useNavigation();
	const t = useT();

	/**
	 *
	 */
	const handleOpenDrawer = React.useCallback(() => {
		(navigation as unknown as { openDrawer: () => void }).openDrawer();
	}, [navigation]);

	/**
	 * Large screen
	 */
	if (screenSize === 'lg') {
		return null;
	}

	/**
	 * Small screen - icon only
	 */
	if (screenSize === 'sm') {
		return (
			<Button
				onPress={handleOpenDrawer}
				className="rounded-none bg-transparent px-3 hover:bg-white/10"
			>
				<Icon name="bars" className="text-sidebar-foreground" />
			</Button>
		);
	}

	/**
	 * Medium screen - icon with text
	 */
	return (
		<Button
			onPress={handleOpenDrawer}
			className="rounded-none bg-transparent px-3 hover:bg-white/10"
		>
			<HStack className="gap-2">
				<Icon name="bars" className="text-sidebar-foreground" />
				<ButtonText className="text-sidebar-foreground">{t('common.menu')}</ButtonText>
			</HStack>
		</Button>
	);
};

export default HeaderLeft;
