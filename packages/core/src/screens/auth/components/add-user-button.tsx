import React from 'react';

import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';
import { getLogger } from '@wcpos/utils/logger';

import { useWcposAuth } from '../../../hooks/use-wcpos-auth';

const authLogger = getLogger(['wcpos', 'auth', 'user']);
import { useLoginHandler } from '../hooks/use-login-handler';

interface Props {
	site: import('@wcpos/database').SiteDocument;
}

export function AddUserButton({ site }: Props) {
	const { handleLoginSuccess, isProcessing, error } = useLoginHandler(site);
	const processedResponseRef = React.useRef<string | null>(null);

	const { isReady, response, promptAsync } = useWcposAuth({ site });

	React.useEffect(() => {
		if (!response) return;

		// Create a unique key to prevent double-processing
		const responseKey = response.params?.access_token || response.error || response.type;
		if (processedResponseRef.current === responseKey) {
			return;
		}

		if (response.type === 'success') {
			authLogger.debug(`Login successful for site: ${site.name}`);
			processedResponseRef.current = responseKey;
			handleLoginSuccess({ params: response.params } as any);
		} else if (response.type === 'error') {
			authLogger.error(`Login failed: ${response.error}`, {
				showToast: true,
				context: {
					siteName: site.name,
					response,
				},
			});
			processedResponseRef.current = responseKey;
		}
	}, [response, handleLoginSuccess, site.name]);

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<IconButton
					name="circlePlus"
					size="xl"
					disabled={!isReady || isProcessing}
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
