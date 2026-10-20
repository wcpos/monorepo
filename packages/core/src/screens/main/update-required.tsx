import * as React from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, ButtonText } from '@wcpos/components/button';

import { UpdateRequiredNotice } from '../../components/update-required-notice';
import { useAppState } from '../../contexts/app-state';
import { useT } from '../../contexts/translations';

/**
 * The server's deliberate protocol-gate refusal (wcpos_update_required): this
 * app is older than the store's WCPOS plugin now requires, and the transport
 * has latched sync shut for the session. The mirror of UpgradeRequired, which
 * covers the other direction (plugin older than the app).
 *
 * Recovery IS the app update, so the only offered actions are the ones that
 * pick it up: reload on web (the bundle auto-updates), restart guidance
 * elsewhere, and logout. Copy comes from the SYNC341 registry entry via the
 * shared UpdateRequiredNotice — the login card renders the same notice.
 */
export function UpdateRequired() {
	const t = useT();
	const { logout } = useAppState();

	return (
		<View
			testID="update-required-screen"
			style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}
		>
			<UpdateRequiredNotice>
				<Button testID="update-required-logout" variant="outline" onPress={logout}>
					<ButtonText>{t('common.logout')}</ButtonText>
				</Button>
			</UpdateRequiredNotice>
		</View>
	);
}
