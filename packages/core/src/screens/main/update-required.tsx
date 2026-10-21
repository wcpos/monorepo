import * as React from 'react';

import { GateScreen } from '@wcpos/components/gate-screen';
import { getErrorCodeDocURL } from '@wcpos/utils/logger/constants';
import { Platform } from '@wcpos/utils/platform';

import { useAppState } from '../../contexts/app-state';
import { useT } from '../../contexts/translations';
import { translateErrorSummary } from './logs/generated/error-summaries.generated';

const CODE = 'SYNC341';

/**
 * The server's deliberate protocol-gate refusal (wcpos_update_required): this
 * app is older than the store's WCPOS plugin now requires, and the transport
 * has latched sync shut for the session. The mirror of UpgradeRequired, which
 * covers the other direction (plugin older than the app).
 *
 * Recovery IS the app update, so the only offered actions are the ones that
 * pick it up: reload on web (the bundle auto-updates), the platform's update
 * step in the line elsewhere, and logout. The title comes from the SYNC341
 * registry entry via the generated translator (one source for screen, log row
 * and docs page); the line names which side is behind and the one step for
 * this platform (the registry's action hint is the log row's).
 */
export function UpdateRequired() {
	const t = useT();
	const { logout } = useAppState();
	const description = Platform.isWeb
		? t('gate.update_app.web')
		: Platform.isElectron
			? t('gate.update_app.desktop')
			: t('gate.update_app.native');

	return (
		<GateScreen
			tone="warn"
			testID="update-required-screen"
			title={translateErrorSummary(t, CODE)}
			description={description}
			primary={
				Platform.isWeb
					? {
							label: t('common.reload', { _tags: 'core' }),
							onPress: () => window.location.reload(),
							testID: 'update-required-reload',
						}
					: undefined
			}
			secondary={{
				label: t('common.logout'),
				onPress: () => void logout(),
				testID: 'update-required-logout',
			}}
			docs={{
				label: t('common.learn_more', { _tags: 'core' }),
				href: getErrorCodeDocURL(CODE),
				code: CODE,
				testID: `update-required-docs-link-${CODE}`,
			}}
		/>
	);
}
