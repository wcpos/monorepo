import * as React from 'react';

import { GateScreen } from '@wcpos/components/gate-screen';
import { getErrorCodeDocURL } from '@wcpos/utils/logger/constants';

import { useT } from '../../contexts/translations';

/**
 * The store's WCPOS plugin is older than this app speaks. The mirror of
 * UpdateRequired: the fix is on the WordPress site, so the screen names it,
 * links the AUTH331 docs page, and offers Check again and logout. The AUTH331
 * link waits until the live check has answered.
 */
export function UpgradeRequired({
	checking,
	onCheckAgain,
	onLogout,
}: {
	checking: boolean;
	onCheckAgain: () => void;
	onLogout: () => void;
}) {
	const t = useT();

	return (
		<GateScreen
			tone="warning"
			testID="upgrade-required-screen"
			title={t('gate.update_plugin.title')}
			description={t('gate.update_plugin.description')}
			primary={{
				label: checking ? t('gate.update_plugin.checking') : t('gate.update_plugin.check_again'),
				onPress: onCheckAgain,
				disabled: checking,
				testID: 'upgrade-required-check-again',
			}}
			secondary={{
				label: t('common.logout'),
				onPress: onLogout,
				testID: 'upgrade-required-logout',
			}}
			docs={
				checking
					? undefined
					: {
							label: t('common.learn_more'),
							href: getErrorCodeDocURL('AUTH331'),
							code: 'AUTH331',
							testID: 'upgrade-required-docs-link-AUTH331',
						}
			}
		/>
	);
}
