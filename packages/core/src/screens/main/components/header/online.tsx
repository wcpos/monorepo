import * as React from 'react';

import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';
import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { getLogger } from '@wcpos/utils/logger';
import type { OnlineStatus } from '@wcpos/hooks/use-online-status';

import { useT } from '../../../../contexts/translations';

const uiLogger = getLogger(['wcpos', 'ui', 'header']);

type OnlineState = {
	variant: 'success' | 'warning' | 'error';
	tooltip: string;
};

export function Online() {
	const { status } = useOnlineStatus();
	const t = useT();
	const prevStatusRef = React.useRef<OnlineStatus | null>(status);

	const state: OnlineState = React.useMemo(() => {
		switch (status) {
			case 'offline':
				return {
					variant: 'error',
					tooltip: t('No internet connection', { _tags: 'core' }),
				};
			case 'online-website-unavailable':
				return {
					variant: 'warning',
					tooltip: t('Site not reachable', { _tags: 'core' }),
				};
			case 'online-website-available':
				return {
					variant: 'success',
					tooltip: t('Online', { _tags: 'core' }),
				};
			default:
				return {
					variant: 'error',
					tooltip: t('Unknown connection status', { _tags: 'core' }),
				};
		}
	}, [status, t]);

	// Log status changes
	React.useEffect(() => {
		const prevStatus = prevStatusRef.current;

		// Don't log if this is the first render (no previous status)
		if (prevStatus === null) {
			prevStatusRef.current = status;
			return;
		}

		// Don't log if status hasn't changed
		if (prevStatus === status) {
			return;
		}

		// Log the status change
		const logConfig = { showToast: true, saveToDb: true };

		switch (status) {
			case 'offline':
				uiLogger.error(t('Device went offline', { _tags: 'core' }), logConfig);
				break;
			case 'online-website-unavailable':
				uiLogger.error(t('Website is unreachable', { _tags: 'core' }), logConfig);
				break;
			case 'online-website-available':
				uiLogger.success(t('Connection restored', { _tags: 'core' }), logConfig);
				break;
		}

		prevStatusRef.current = status;
	}, [status, t]);

	return (
		<Tooltip>
			<TooltipTrigger className="px-2">
				<Icon name="circle" variant={state.variant} />
			</TooltipTrigger>
			<TooltipContent side="bottom">
				<Text>{state.tooltip}</Text>
			</TooltipContent>
		</Tooltip>
	);
}
