import * as React from 'react';

import { Button, ButtonText } from '@wcpos/components/button';
import { Icon } from '@wcpos/components/icon';
import { Loader } from '@wcpos/components/loader';
import { getLogger } from '@wcpos/utils/logger';

import { useT } from '../../../contexts/translations';
import { useWcposAuth } from '../../../hooks/use-wcpos-auth';
import { useLoginHandler } from '../hooks/use-login-handler';
import useSiteConnect from '../hooks/use-site-connect';

const authLogger = getLogger(['wcpos', 'auth', 'demo']);

export function DemoButton() {
	const { onConnect, loading: siteConnectLoading } = useSiteConnect();
	const [connectedSite, setConnectedSite] = React.useState<
		import('@wcpos/database').SiteDocument | null
	>(null);
	const [authCompleted, setAuthCompleted] = React.useState(false);
	const t = useT();

	// Track which response we've already processed to prevent double-execution
	const processedResponseRef = React.useRef<string | null>(null);

	// Track if we've already triggered auth to prevent double-trigger race condition
	const authTriggeredRef = React.useRef(false);

	// Setup login handler for the connected site
	const { handleLoginSuccess, isProcessing } = useLoginHandler(connectedSite);

	// Setup auth hook with demo user parameter
	const { isReady, response, promptAsync } = useWcposAuth({
		site: connectedSite,
		extraParams: { user: 'demo' },
	});

	// Handle OAuth response
	React.useEffect(() => {
		if (!response || !connectedSite) return;

		// Create a unique key for this response to prevent double-processing
		const responseKey = response.params?.access_token || response.error || response.type;
		if (processedResponseRef.current === responseKey) {
			return; // Already processed this response
		}

		if (response.type === 'success') {
			authLogger.debug('Demo login successful');
			processedResponseRef.current = responseKey;
			setAuthCompleted(true);
			handleLoginSuccess({ params: response.params } as any);
		} else if (response.type === 'error') {
			authLogger.error(`Demo login failed: ${response.error}`, {
				showToast: true,
				context: { response },
			});
			processedResponseRef.current = responseKey;
			setAuthCompleted(true); // Also set completed on error to prevent retry
		}
	}, [response, connectedSite, handleLoginSuccess]);

	const handleDemoLogin = async () => {
		// Reset auth state for new login attempt
		setAuthCompleted(false);
		setConnectedSite(null);
		processedResponseRef.current = null;
		authTriggeredRef.current = false;

		try {
			// Step 1: Connect to demo site
			const site = await onConnect('https://demo.wcpos.com');
			// const site = await onConnect('https://wcposdev.wpengine.com');

			if (!site) {
				throw new Error('Could not connect to demo site');
			}

			authLogger.debug('Demo site connected successfully');
			setConnectedSite(site);
		} catch (err) {
			// Don't show toast here - specific error messages are already displayed
			// by the hooks (use-url-discovery, use-api-discovery, use-auth-testing)
			authLogger.error(`Demo connection failed: ${err.message}`);
		}
	};

	// Trigger OAuth flow when site is connected and hook is ready
	React.useEffect(() => {
		// Use ref for synchronous check to prevent race conditions
		if (authTriggeredRef.current) {
			return;
		}

		if (connectedSite && isReady && !isProcessing && !authCompleted) {
			authLogger.debug('Triggering OAuth flow for demo site');
			authTriggeredRef.current = true; // Set immediately before async call
			promptAsync();
		}
	}, [connectedSite, isReady, isProcessing, authCompleted, promptAsync]);

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
			<ButtonText>{t('auth.enter_demo_store')}</ButtonText>
		</Button>
	);
}
