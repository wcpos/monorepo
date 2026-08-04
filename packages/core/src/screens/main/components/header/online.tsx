import * as React from 'react';

import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';
import { useOnlineStatus } from '@wcpos/hooks/use-online-status';

import { useT } from '../../../../contexts/translations';

type OnlineState = {
	variant: 'success' | 'warning' | 'error';
	tooltip: string;
};

export function Online() {
	const { status } = useOnlineStatus();
	const t = useT();

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
