import * as React from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '@wcpos/components/text';
import { requestStateManager } from '@wcpos/hooks/use-http-client/request-state-manager';
import { useDocField } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useEngineStatus, useMutationCounts } from '../../hooks/use-engine-monitor';
import { useSessionLoginFlow } from '../../hooks/use-rest-http-client/use-session-login-flow';

const logger = getLogger(['wcpos', 'auth', 'error']);

/**
 * A refused session is a STATE that lasts until the cashier logs in, so it is
 * a banner; the toast only marks the moment it starts.
 */
export function SessionHoldBanner() {
	const status = useEngineStatus();
	const { syncBacklogSales } = useMutationCounts();
	const { site, wpCredentials, logout } = useStoreSession();
	const { triggerAuthFlow } = useSessionLoginFlow(site, wpCredentials, logout);
	const t = useT();
	const accessToken = useDocField(wpCredentials, (value) => value.access_token);
	const refreshToken = useDocField(wpCredentials, (value) => value.refresh_token);
	const previousTokens = React.useRef({ accessToken, refreshToken });
	const previousHeld = React.useRef(false);
	const held = status.writeSessionHeld || status.authRequired;

	// Shared credential document changes arrive outside this component (e.g. another tab).
	React.useEffect(() => {
		const changed =
			previousTokens.current.accessToken !== accessToken ||
			previousTokens.current.refreshToken !== refreshToken;
		previousTokens.current = { accessToken, refreshToken };
		if (changed && requestStateManager.isAuthFailed()) {
			requestStateManager.clearAuthFailure();
			logger.info('Session renewed by another tab', {
				showToast: true,
				toast: { title: t('auth.session_renewed_automatically') },
				context: { siteName: site.name },
			});
		}
	}, [accessToken, refreshToken, site.name, t]);

	// The toast marks an external engine state transition, once per hold.
	React.useEffect(() => {
		if (held && !previousHeld.current) {
			logger.warn('Please log in to continue', {
				showToast: true,
				toast: {
					action: { label: t('auth.log_in'), onClick: () => triggerAuthFlow() },
				},
				code: ERROR_CODES.SESSION_EXPIRED,
				context: { siteName: site.name },
			});
		}
		previousHeld.current = held;
	}, [held, site.name, t, triggerAuthFlow]);

	if (!held) return null;

	return (
		<View
			testID="session-hold-banner"
			className="border-destructive/40 bg-destructive/10 flex-row items-center gap-2 rounded-md border p-2"
		>
			<Text className="text-destructive flex-1 text-sm">
				{syncBacklogSales > 0
					? t('auth.sales_waiting_to_sync', { count: syncBacklogSales })
					: t('auth.session_expired')}
			</Text>
			<Pressable testID="session-hold-login" onPress={() => triggerAuthFlow()}>
				<Text className="text-destructive web:hover:opacity-80 text-sm font-medium underline">
					{t('auth.log_in')}
				</Text>
			</Pressable>
		</View>
	);
}
