import React from 'react';

import { makeRedirectUri, ResponseType, useAuthRequest } from 'expo-auth-session';

import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';
import log from '@wcpos/utils/logger';

import { useLoginHandler } from '../hooks/use-login-handler';

interface Props {
	site: import('@wcpos/database').SiteDocument;
}

export function AddUserButton({ site }: Props) {
	const { handleLoginSuccess, isProcessing, error } = useLoginHandler(site);

	const redirectUri = makeRedirectUri({
		scheme: 'wcpos',
		path: (window as any)?.baseUrl ?? undefined,
	});

	// point at this site's auth endpoint
	const discovery = {
		authorizationEndpoint: site.wcpos_login_url,
	};

	// we only need `token`, `refresh_token`, `expires_in` in the query params,
	// so use ResponseType.Token to pick them all up
	const [request, response, promptAsync] = useAuthRequest(
		{
			clientId: 'unused', // expo requires this field
			responseType: ResponseType.Token,
			redirectUri,
			extraParams: { redirect_uri: redirectUri },
			scopes: [],
			usePKCE: false,
		},
		discovery
	);

	React.useEffect(() => {
		log.debug(`OAuth login successful for site: ${site.name}`);

		if (response?.type === 'success') {
			handleLoginSuccess(response as any);
		} else if (response?.type === 'error') {
			log.error(`OAuth login failed: ${response.error}`);
			// TODO: Show error toast/notification
		}
	}, [response, handleLoginSuccess]);

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<IconButton
					name="circlePlus"
					size="xl"
					disabled={!request || isProcessing}
					onPress={() => promptAsync()}
				/>
			</TooltipTrigger>
			<TooltipContent>
				<Text>
					{isProcessing
						? 'Processing login...'
						: error
							? `Error: ${error}`
							: `Login to ${site.name}`}
				</Text>
			</TooltipContent>
		</Tooltip>
	);
}
