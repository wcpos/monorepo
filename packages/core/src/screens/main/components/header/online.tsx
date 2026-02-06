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
					tooltip: t('common.no_internet_connection'),
				};
			case 'online-website-unavailable':
				return {
					variant: 'warning',
					tooltip: t('common.site_not_reachable'),
				};
			case 'online-website-available':
				return {
					variant: 'success',
					tooltip: t('common.online'),
				};
			default:
				return {
					variant: 'error',
					tooltip: t('common.unknown_connection_status'),
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
				uiLogger.error(t('common.device_went_offline'), logConfig);
				break;
			case 'online-website-unavailable':
				uiLogger.error(t('common.website_is_unreachable'), logConfig);
				break;
			case 'online-website-available':
				uiLogger.success(t('common.connection_restored'), logConfig);
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
