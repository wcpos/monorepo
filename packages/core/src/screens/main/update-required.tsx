import * as React from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, ButtonText } from '@wcpos/components/button';
import { DocsLink } from '@wcpos/components/docs-link';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { getErrorCodeDocURL } from '@wcpos/utils/logger/constants';
import { Platform } from '@wcpos/utils/platform';

import { useAppState } from '../../contexts/app-state';
import { useT } from '../../contexts/translations';
import { translateErrorAction } from './logs/generated/error-actions.generated';
import { translateErrorSummary } from './logs/generated/error-summaries.generated';

const CODE = 'SYNC341';

/**
 * The server's deliberate protocol-gate refusal (wcpos_update_required): this
 * app is older than the store's WCPOS plugin now requires, and the transport
 * has latched sync shut for the session. The mirror of UpgradeRequired, which
 * covers the other direction (plugin older than the app).
 *
 * Recovery IS the app update, so the only offered actions are the ones that
 * pick it up: reload on web (the bundle auto-updates), restart guidance
 * elsewhere, and logout. Copy comes from the SYNC341 registry entry via the
 * generated translators — one source for screen, log row and docs page.
 */
export function UpdateRequired() {
	const t = useT();
	const { logout } = useAppState();

	return (
		<View
			testID="update-required-screen"
			style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}
		>
			<VStack className="max-w-md items-center">
				<HStack>
					<Icon name="triangleExclamation" variant="destructive" />
					<Text className="text-destructive">{translateErrorSummary(t, CODE)}</Text>
				</HStack>
				<Text className="text-center">{translateErrorAction(t, CODE)}</Text>
				<DocsLink testID={`update-required-docs-link-${CODE}`} href={getErrorCodeDocURL(CODE)}>
					{t('common.learn_more', { _tags: 'core' })}
				</DocsLink>
				<HStack className="justify-center p-2">
					{Platform.isWeb ? (
						<Button testID="update-required-reload" onPress={() => window.location.reload()}>
							<ButtonText>{t('common.reload', { _tags: 'core' })}</ButtonText>
						</Button>
					) : null}
					<Button variant="outline" onPress={logout}>
						<ButtonText>{t('common.logout')}</ButtonText>
					</Button>
				</HStack>
			</VStack>
		</View>
	);
}
