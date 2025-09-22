import * as React from 'react';

import { makeRedirectUri, ResponseType, useAuthRequest } from 'expo-auth-session';

import { Button, ButtonText } from '@wcpos/components/button';
import { Icon } from '@wcpos/components/icon';
import { Loader } from '@wcpos/components/loader';
import log from '@wcpos/utils/logger';

import { useT } from '../../../contexts/translations';
import { useLoginHandler } from '../hooks/use-login-handler';
import useSiteConnect from '../hooks/use-site-connect';

export function DemoButton() {
	const { onConnect, loading: siteConnectLoading } = useSiteConnect();
	const [connectedSite, setConnectedSite] = React.useState<
		import('@wcpos/database').SiteDocument | null
	>(null);
	const [authCompleted, setAuthCompleted] = React.useState(false);
	const t = useT();

	// Setup login handler for the connected site
	const { handleLoginSuccess, isProcessing } = useLoginHandler(connectedSite);

	// Setup redirect URI for OAuth
	const redirectUri = makeRedirectUri({
		scheme: 'wcpos',
		path: (window as any)?.baseUrl ?? undefined,
	});

	// Setup OAuth discovery for the demo site
	const discovery = connectedSite
		? {
				authorizationEndpoint: connectedSite.wcpos_login_url,
			}
		: null;

	// Setup OAuth request
	const [request, response, promptAsync] = useAuthRequest(
		{
			clientId: 'unused', // expo requires this field
			responseType: ResponseType.Token,
			redirectUri,
			extraParams: {
				redirect_uri: redirectUri,
				user: 'demo', // Add demo user parameter
			},
			scopes: [],
			usePKCE: false,
		},
		discovery
	);

	// Handle OAuth response
	React.useEffect(() => {
		if (response?.type === 'success') {
			log.debug('Demo login successful');
			setAuthCompleted(true);
			handleLoginSuccess(response as any);
		} else if (response?.type === 'error') {
			log.error(`Demo login failed: ${response.error}`, {
				showToast: true,
				context: { response },
			});
			setAuthCompleted(true); // Also set completed on error to prevent retry
		}
	}, [response, handleLoginSuccess]);

	const handleDemoLogin = async () => {
		// Reset auth state for new login attempt
		setAuthCompleted(false);
		setConnectedSite(null);

		try {
			// Step 1: Connect to demo site
			// const site = await onConnect('https://demo.wcpos.com');
			const site = await onConnect('https://wcposdev.wpengine.com');

			if (!site) {
				throw new Error('Could not connect to demo site');
			}

			log.debug('Demo site connected successfully');
			setConnectedSite(site);
		} catch (err) {
			log.error(`Demo connection failed: ${err.message}`, {
				showToast: true,
			});
		}
	};

	// Trigger OAuth flow when site is connected and request is ready
	React.useEffect(() => {
		if (connectedSite && request && !isProcessing && !authCompleted) {
			log.debug('Triggering OAuth flow for demo site');
			promptAsync();
		}
	}, [connectedSite, request, isProcessing, authCompleted, promptAsync]);

	const loading = siteConnectLoading || isProcessing;

	return (
		<Button
			onPress={handleDemoLogin}
			disabled={loading}
			variant="muted"
			size="sm"
			rightIcon={
				loading ? (
					<Loader variant="muted" size="xs" />
				) : (
					<Icon variant="muted" size="xs" name="arrowRight" />
				)
			}
		>
			<ButtonText>{t('Enter Demo Store', { _tags: 'core' })}</ButtonText>
		</Button>
	);
}
