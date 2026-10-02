import * as React from 'react';

import { useNavigation } from 'expo-router';

import { Button } from '@wcpos/components/button';
import { Icon } from '@wcpos/components/icon';

import { useTheme } from '../../../../contexts/theme';
import { useT } from '../../../../contexts/translations';

/**
 * Header left button - uses sidebar-foreground for icons/text since
 * the header has a dark sidebar background in all themes.
 */
export function HeaderLeft({ className = '' }: { className?: string }) {
	const { screenSize } = useTheme();
	const t = useT();
	const navigation = useNavigation();

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

	// The phone layout: icon only. There is no layout between the two (owner, 2026-10-02).
	return (
		<Button
			variant="sidebar"
			testID="drawer-open-button"
			aria-label={t('common.menu')}
			onPress={handleOpenDrawer}
			className={`px-3 ${className}`}
		>
			<Icon name="bars" className="text-sidebar-foreground" />
		</Button>
	);
}
