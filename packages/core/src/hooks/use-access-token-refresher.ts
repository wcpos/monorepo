import * as React from 'react';

import { credentialsTokenOwner } from '@wcpos/query/user-db';
import { refreshAccessToken } from '@wcpos/hooks/use-http-client';

import { useStoreSession } from '../contexts/app-state';
import { useT } from '../contexts/translations';
import { createRefreshHttpClient } from '../screens/main/hooks/use-rest-http-client/refresh-http-client';

export function useAccessTokenRefresher() {
	const { site, wpCredentials } = useStoreSession();
	const t = useT();
	return React.useCallback(
		() =>
			refreshAccessToken({
				site,
				wpUser: credentialsTokenOwner(wpCredentials),
				getHttpClient: createRefreshHttpClient,
				sessionRenewedMessage: t('auth.session_renewed_automatically'),
			}),
		[site, wpCredentials, t]
	);
}
