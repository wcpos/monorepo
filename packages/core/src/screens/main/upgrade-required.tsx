import * as React from 'react';

import { GateScreen } from '@wcpos/components/gate-screen';
import { getErrorCodeDocURL } from '@wcpos/utils/logger/constants';

import { useAppState } from '../../contexts/app-state';
import { useT } from '../../contexts/translations';

/**
 * The store's WCPOS plugin is older than this app speaks. The mirror of
 * UpdateRequired: the fix is on the WordPress site, so the screen names it,
 * links the AUTH331 docs page and offers only logout.
 */
export function UpgradeRequired() {
	const t = useT();
	const { logout } = useAppState();

	return (
		<GateScreen
			tone="warn"
			testID="upgrade-required-screen"
			title={t('gate.update_plugin.title')}
			description={t('gate.update_plugin.description')}
			secondary={{
				label: t('common.logout'),
				onPress: () => void logout(),
				testID: 'upgrade-required-logout',
			}}
			docs={{
				label: t('common.learn_more'),
				href: getErrorCodeDocURL('AUTH331'),
				code: 'AUTH331',
				testID: 'upgrade-required-docs-link-AUTH331',
			}}
		/>
	);
}
