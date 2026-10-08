import * as React from 'react';

import { refreshAccessToken } from '@wcpos/hooks/use-http-client';

import { useStoreSession } from '../contexts/app-state';
import { useT } from '../contexts/translations';
import { createRefreshHttpClient } from '../screens/main/hooks/use-rest-http-client/refresh-http-client';

export function useAccessTokenRefresher() {
	const { site, wpCredentials } = useStoreSession();
	const t = useT();
	// The documents already satisfy the validation handler's site/wpUser config;
	// pass them directly so getLatest and incrementalPatch retain their receiver.
	return React.useCallback(
		() =>
			refreshAccessToken({
				site,
				wpUser: wpCredentials,
				getHttpClient: createRefreshHttpClient,
				sessionRenewedMessage: t('auth.session_renewed_automatically'),
			}),
		[site, wpCredentials, t]
	);
}
