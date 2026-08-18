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
export function HeaderLeft() {
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
				variant="sidebar"
				testID="drawer-open-button"
				onPress={handleOpenDrawer}
				className="px-3"
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
			variant="sidebar"
			testID="drawer-open-button"
			onPress={handleOpenDrawer}
			className="px-3"
		>
			<HStack className="gap-2">
				<Icon name="bars" className="text-sidebar-foreground" />
				<ButtonText>{t('common.menu')}</ButtonText>
			</HStack>
		</Button>
	);
}
